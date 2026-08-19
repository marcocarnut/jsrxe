// Fast CPU keycracking: a JIT'd JavaScript kernel, the CPU sibling of crack.js's
// WGSL codegen. The pure-JS oracle (runCrackCPU) is slow by design -- a BigInt
// loop counter, BigInt div/mod and a fresh string per candidate. Here we instead
// GENERATE a specialised JS function per pattern+hash: a monomorphic u32 loop the
// engine's JIT compiles to native, decoding the odometer once per work slice and
// advancing it by +1 with carry (the incremental odometer), building the message
// words inline, and MD5-ing them unrolled. No BigInt, no per-candidate allocation.
//
// This module is self-contained (no imports) so a Web Worker can load it directly
// and run a keyspace slice in its own thread -- the multicore path. buildMd5Fixed
// returns a compiled `(base, count, T, nt, onHit) => void` that sweeps the global
// index range [base, base+count) (base+count <= 2^53, exact in a JS number).

// ---- MD5 constants ------------------------------------------------------
const CMD5_K = [
 0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
 0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
 0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
 0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
 0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
 0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
 0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
 0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391];
const CMD5_S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
 5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
 4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
 6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];

// MD5 message-word index per round.
function md5G(i) {
  if (i < 16) return i;
  if (i < 32) return (5*i + 1) & 15;
  if (i < 48) return (3*i + 5) & 15;
  return (7*i) & 15;
}
// MD5 F-function per stage, over JS state vars a,b,c,d.
function md5F(i) {
  if (i < 16) return "((b & c) | (~b & d))";
  if (i < 32) return "((d & b) | (~d & c))";
  if (i < 48) return "(b ^ c ^ d)";
  return "(c ^ (b | ~d))";
}

// ---- the generated MD5 kernel (fixed-width product path) ----------------
// `positions` is analyzePlan's fast-path layout: [{ n, L, off, bytes }...], every
// position fixed width, the candidate <= 55 bytes (one MD5 block). We bake each
// message word from the wheel digits and the position byte tables PB0..; the
// digits d0.. are decoded once from `base` then carried +1 per step.
export function buildMd5Fixed(positions) {
  const P = positions.length;
  let width = 0; for (const p of positions) width += p.L;

  // Map each candidate byte position `a` to (position index, sub-offset) and emit
  // the byte expression: PB{p}[d{p}*L + sub]  (L=1 -> PB{p}[d{p}]).
  const cover = new Array(width);
  positions.forEach((p, pi) => { for (let k = 0; k < p.L; k++) cover[p.off + k] = { pi, sub: k }; });
  const byteExpr = a => {
    const { pi, sub } = cover[a], L = positions[pi].L;
    return L === 1 ? `PB${pi}[d${pi}]` : `PB${pi}[d${pi}*${L}+${sub}]`;
  };

  // Message words (little-endian; 0x80 pad at byte `width`; m14 = bit length).
  let msg = "";
  for (let k = 0; k < 14; k++) {
    const parts = [];
    for (let t = 0; t < 4; t++) {
      const a = 4*k + t, sh = t ? `<<${8*t}` : "";
      if (a < width) parts.push(t ? `(${byteExpr(a)}${sh})` : byteExpr(a));
      else if (a === width) parts.push(t ? `(0x80${sh})` : "0x80");
    }
    msg += `    var m${k} = ${parts.length ? parts.join(" | ") : "0"};\n`;
  }
  msg += `    var m14 = ${width * 8}, m15 = 0;\n`;

  // 64 unrolled rounds, 32-bit via |0; rotate inline.
  let rounds = "    var a=0x67452301, b=0xefcdab89|0, c=0x98badcfe|0, d=0x10325476;\n";
  for (let i = 0; i < 64; i++) {
    const g = md5G(i), s = CMD5_S[i], k = CMD5_K[i] >>> 0;
    rounds += `    { var f = (${md5F(i)} + a + ${k} + m${g}) | 0; a=d; d=c; c=b; b = (b + (((f<<${s})|(f>>>${32-s}))|0)) | 0; }\n`;
  }
  // Finalise + byte-reverse to big-endian digest words (match parseTargets order).
  const rev = x => `((((${x})&0xff)<<24) | (((${x})&0xff00)<<8) | (((${x})>>>8)&0xff00) | (((${x})>>>24)&0xff)) >>> 0`;
  rounds += `    var w0 = ${rev("(a+0x67452301)|0")}, w1 = ${rev("(b+(0xefcdab89|0))|0")}, w2 = ${rev("(c+(0x98badcfe|0))|0")}, w3 = ${rev("(d+0x10325476)|0")};\n`;

  // Decode `base` into digits (position P-1 is least significant / fastest).
  let decode = "    var q = base;\n";
  for (let pi = P - 1; pi >= 0; pi--) {
    const n = positions[pi].n;
    decode += `    var d${pi} = q % ${n}; q = (q - d${pi}) / ${n};\n`;
  }

  // +1 with carry, unrolled from the least-significant wheel; the top never
  // overflows because base+count <= total.
  const carry = pi => {
    let s = `      d${pi}++;\n`;
    if (pi > 0) s += `      if (d${pi} === ${positions[pi].n}) { d${pi} = 0;\n` + carry(pi - 1) + `      }\n`;
    return s;
  };

  // Binary search the sorted targets (T: Uint32Array, nt rows x 4, big-endian).
  const ptBytes = []; for (let a = 0; a < width; a++) ptBytes.push(byteExpr(a));
  const search = `
      var lo = 0, hi = nt - 1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1, bi = mid << 2;
        var t0 = T[bi];   if (w0 < t0) { hi = mid-1; continue; } if (w0 > t0) { lo = mid+1; continue; }
        var t1 = T[bi+1]; if (w1 < t1) { hi = mid-1; continue; } if (w1 > t1) { lo = mid+1; continue; }
        var t2 = T[bi+2]; if (w2 < t2) { hi = mid-1; continue; } if (w2 > t2) { lo = mid+1; continue; }
        var t3 = T[bi+3]; if (w3 < t3) { hi = mid-1; continue; } if (w3 > t3) { lo = mid+1; continue; }
        onHit(String.fromCharCode(${ptBytes.join(", ")}), mid); break;
      }`;

  const pbArgs = positions.map((_, i) => `PB${i}`).join(", ");
  const src = `"use strict";
return function crack(base, count, T, nt, onHit) {
${decode}  for (var it = 0; it < count; it++) {
${msg}${rounds}${search}
${carry(P - 1)}  }
};`;
  // Compile with the position byte tables bound in the closure.
  const make = new Function(pbArgs, src);
  return make(...positions.map(p => p.bytes));
}

// Chunk the global keyspace [0,total) into work slices of at most SLICE, so a
// worker (or the main thread) can crack a slice and yield. total may exceed 2^53
// in principle, but any CPU-tractable keyspace is far below it.
export const SLICE = 1 << 20;   // ~1M candidates/slice (~0.1s at 10 MH/s): the
                                // main thread yields between slices to stay live
