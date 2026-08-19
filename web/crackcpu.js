// Fast CPU keycracking: a JIT'd JavaScript kernel, the CPU sibling of crack.js's
// WGSL codegen. The pure-JS oracle (runCrackCPU) is slow by design -- a BigInt
// loop counter, BigInt div/mod and a fresh string per candidate. Here we instead
// GENERATE a specialised JS function per pattern+hash: a monomorphic u32 loop the
// engine's JIT compiles to native, decoding the odometer once per work slice and
// advancing it by +1 with carry (the incremental odometer), assembling the
// message words inline, and running the hash unrolled. No BigInt, no per-
// candidate allocation. Handles md5, ntlm (MD4 over UTF-16LE), sha1 and sha256 --
// the same four the GPU kernel does, on the fixed-width product path.
//
// Self-contained (no imports) so a Web Worker can load it directly and crack a
// keyspace slice in its own thread. buildCpuKernel returns a compiled
// `(base, count, T, nt, onHit) => void` that sweeps the global index range
// [base, base+count) (base+count <= 2^53, exact in a JS number); T is the sorted
// target words (nt rows x H.words, big-endian), onHit(plaintext, targetIndex).

// ---- 32-bit expression helpers ------------------------------------------
const crotl = (x, n) => `(((${x}) << ${n}) | ((${x}) >>> ${32 - n}))`;
const crotr = (x, n) => `(((${x}) >>> ${n}) | ((${x}) << ${32 - n}))`;
// byte-reverse a little-endian digest word to big-endian (md5/md4 compare order).
const revw = x => `((((${x})&0xff)<<24) | (((${x})&0xff00)<<8) | (((${x})>>>8)&0xff00) | (((${x})>>>24)&0xff)) >>> 0`;

// ---- hash constants -----------------------------------------------------
const MD5_KC = [
 0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
 0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
 0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
 0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
 0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
 0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
 0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
 0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391];
const MD5_SC = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
 5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
 4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
 6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
const SHA1_IVC  = [0x67452301,0xefcdab89,0x98badcfe,0x10325476,0xc3d2e1f0];
const SHA256_IVC = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
const SHA256_KC = [
 0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
 0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
 0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
 0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
 0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
 0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
 0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
 0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];

// ---- compression, as JS statements over m0..m15, defining w0..w{words-1} -----
// The digest words are emitted unsigned and in big-endian compare order, matching
// parseTargets (md5/md4 little-endian internally, so byte-reversed; sha native).
function md5Body() {
  let s = "    var a=0x67452301, b=0xefcdab89|0, c=0x98badcfe|0, d=0x10325476;\n";
  const F = i => i < 16 ? "((b & c) | (~b & d))" : i < 32 ? "((d & b) | (~d & c))" : i < 48 ? "(b ^ c ^ d)" : "(c ^ (b | ~d))";
  const G = i => i < 16 ? i : i < 32 ? (5*i+1) & 15 : i < 48 ? (3*i+5) & 15 : (7*i) & 15;
  for (let i = 0; i < 64; i++) {
    const g = G(i), sh = MD5_SC[i], k = MD5_KC[i] >>> 0;
    s += `    { var f=(${F(i)} + a + ${k} + m${g})|0; a=d; d=c; c=b; b=(b + (((f<<${sh})|(f>>>${32-sh}))|0))|0; }\n`;
  }
  s += `    var w0=${revw("(a+0x67452301)|0")}, w1=${revw("(b+(0xefcdab89|0))|0")}, w2=${revw("(c+(0x98badcfe|0))|0")}, w3=${revw("(d+0x10325476)|0")};\n`;
  return s;
}
function md4Body() {                       // NTLM = MD4 of the UTF-16LE plaintext
  let s = "    var a=0x67452301, b=0xefcdab89|0, c=0x98badcfe|0, d=0x10325476;\n";
  const R = ["a","b","c","d"], dest = [0,3,2,1];
  const F = (x,y,z) => `((${x} & ${y}) | (~${x} & ${z}))`;
  const G = (x,y,z) => `((${x} & ${y}) | (${x} & ${z}) | (${y} & ${z}))`;
  const H = (x,y,z) => `(${x} ^ ${y} ^ ${z})`;
  const emit = (ff, kArr, sArr, add) => {
    for (let j = 0; j < 16; j++) {
      const dp = dest[j % 4], dr = R[dp], b1 = R[(dp+1)%4], b2 = R[(dp+2)%4], b3 = R[(dp+3)%4];
      const addc = add ? ` + ${add >>> 0}` : "", sh = sArr[j % 4];
      s += `    { var t=(${dr} + (${ff(b1,b2,b3)}) + m${kArr[j]}${addc})|0; ${dr}=((t<<${sh})|(t>>>${32-sh}))|0; }\n`;
    }
  };
  emit(F, [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [3,7,11,19], 0);
  emit(G, [0,4,8,12,1,5,9,13,2,6,10,14,3,7,11,15], [3,5,9,13], 0x5a827999);
  emit(H, [0,8,4,12,2,10,6,14,1,9,5,13,3,11,7,15], [3,9,11,15], 0x6ed9eba1);
  s += `    var w0=${revw("(a+0x67452301)|0")}, w1=${revw("(b+(0xefcdab89|0))|0")}, w2=${revw("(c+(0x98badcfe|0))|0")}, w3=${revw("(d+0x10325476)|0")};\n`;
  return s;
}
function sha1Body() {                      // big-endian, digest words compared directly
  let s = "";
  for (let i = 0; i < 16; i++) s += `    var W${i}=m${i};\n`;
  for (let i = 16; i < 80; i++) s += `    var W${i}=${crotl(`(W${i-3}^W${i-8}^W${i-14}^W${i-16})`, 1)}|0;\n`;
  s += `    var a=${SHA1_IVC[0]|0}, b=${SHA1_IVC[1]|0}, c=${SHA1_IVC[2]|0}, d=${SHA1_IVC[3]|0}, e=${SHA1_IVC[4]|0};\n`;
  for (let i = 0; i < 80; i++) {
    let f, k;
    if (i < 20)      { f = "((b & c) | (~b & d))";                 k = 0x5a827999; }
    else if (i < 40) { f = "(b ^ c ^ d)";                          k = 0x6ed9eba1; }
    else if (i < 60) { f = "((b & c) | (b & d) | (c & d))";        k = 0x8f1bbcdc; }
    else             { f = "(b ^ c ^ d)";                          k = 0xca62c1d6; }
    s += `    { var t=(${crotl("a",5)} + ${f} + e + ${k|0} + W${i})|0; e=d; d=c; c=${crotl("b",30)}|0; b=a; a=t; }\n`;
  }
  for (let i = 0; i < 5; i++) s += `    var w${i}=(${SHA1_IVC[i]|0} + ${["a","b","c","d","e"][i]})>>>0;\n`;
  return s;
}
function sha256Body() {                     // big-endian, digest words compared directly
  let s = "";
  for (let i = 0; i < 16; i++) s += `    var W${i}=m${i};\n`;
  for (let i = 16; i < 64; i++) {
    const x = `W${i-15}`, y = `W${i-2}`;
    const s0 = `(${crotr(x,7)} ^ ${crotr(x,18)} ^ ((${x}) >>> 3))`;
    const s1 = `(${crotr(y,17)} ^ ${crotr(y,19)} ^ ((${y}) >>> 10))`;
    s += `    var W${i}=(W${i-16} + ${s0} + W${i-7} + ${s1})|0;\n`;
  }
  const R = ["a","b","c","d","e","f","g","h"];
  s += "    var " + R.map((r,i) => `${r}=${SHA256_IVC[i]|0}`).join(", ") + ";\n";
  for (let i = 0; i < 64; i++) {
    s += `    { var S1=${crotr("e",6)}^${crotr("e",11)}^${crotr("e",25)};`
       + ` var ch=(e & f) ^ (~e & g);`
       + ` var t1=(h + S1 + ch + ${SHA256_KC[i]|0} + W${i})|0;`
       + ` var S0=${crotr("a",2)}^${crotr("a",13)}^${crotr("a",22)};`
       + ` var maj=(a & b) ^ (a & c) ^ (b & c);`
       + ` var t2=(S0 + maj)|0;`
       + ` h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0; }\n`;
  }
  for (let i = 0; i < 8; i++) s += `    var w${i}=(${SHA256_IVC[i]|0} + ${R[i]})>>>0;\n`;
  return s;
}

// hash -> { words, endian ('le'|'be'), widen, body }
const HASHSPEC = {
  md5:    { words: 4, endian: "le", widen: false, body: md5Body },
  ntlm:   { words: 4, endian: "le", widen: true,  body: md4Body },
  sha1:   { words: 5, endian: "be", widen: false, body: sha1Body },
  sha256: { words: 8, endian: "be", widen: false, body: sha256Body },
};

export function cpuSupports(hash) { return !!HASHSPEC[hash]; }

// ---- the generated kernel (fixed-width product path) --------------------
// `positions` is analyzePlan's fast-path layout: [{ n, L, off, bytes }...], every
// position fixed width, the candidate one hash block. We bake each message word
// from the wheel digits and the position byte tables PB0..; the digits are
// decoded once from `base` then carried +1 per step.
export function buildCpuKernelSource(positions, hash) {
  const spec = HASHSPEC[hash];
  if (!spec) throw new Error(`cpu kernel: ${hash} not supported`);
  const { words, endian, widen } = spec;
  const P = positions.length;
  let width = 0; for (const p of positions) width += p.L;

  // Candidate byte `a` -> PB{p}[d{p}*L + sub].
  const cover = new Array(width);
  positions.forEach((p, pi) => { for (let k = 0; k < p.L; k++) cover[p.off + k] = { pi, sub: k }; });
  const candByte = a => {
    const { pi, sub } = cover[a], L = positions[pi].L;
    return L === 1 ? `PB${pi}[d${pi}]` : `PB${pi}[d${pi}*${L}+${sub}]`;
  };

  // Message byte at buffer position `a`: candidate byte, UTF-16LE widening zero,
  // 0x80 pad, or nothing. padPos is where the pad byte lands.
  const padPos = widen ? 2 * width : width;
  const msgByte = a => {
    if (a === padPos) return "0x80";
    if (a > padPos) return "0";
    if (widen) return (a & 1) ? "0" : (a >> 1 < width ? candByte(a >> 1) : "0");
    return a < width ? candByte(a) : "0";
  };
  // Combine four message bytes into a word, honouring endianness; drop zeros.
  const word = base4 => {
    const t = [];
    for (let j = 0; j < 4; j++) {
      const e = msgByte(base4 + j); if (e === "0") continue;
      const sh = endian === "le" ? 8 * j : 8 * (3 - j);
      t.push(sh ? `((${e})<<${sh})` : e);
    }
    return t.length ? t.join(" | ") : "0";
  };
  let msg = "";
  for (let k = 0; k < 14; k++) msg += `    var m${k}=${word(4 * k)};\n`;
  const bitlen = padPos * 8;               // width or 2*width bytes, in bits
  msg += endian === "le" ? `    var m14=${bitlen}, m15=0;\n` : `    var m14=0, m15=${bitlen};\n`;

  // Decode `base` into digits (position P-1 least significant / fastest).
  let decode = "    var q=base;\n";
  for (let pi = P - 1; pi >= 0; pi--) decode += `    var d${pi}=q % ${positions[pi].n}; q=(q-d${pi})/${positions[pi].n};\n`;

  // +1 with carry from the least-significant wheel; the top never overflows
  // because base+count <= total.
  const carry = pi => {
    let s = `      d${pi}++;\n`;
    if (pi > 0) s += `      if (d${pi} === ${positions[pi].n}) { d${pi}=0;\n` + carry(pi - 1) + `      }\n`;
    return s;
  };

  // Binary-search the sorted targets (T: nt rows x words, big-endian).
  const ptBytes = []; for (let a = 0; a < width; a++) ptBytes.push(candByte(a));
  let cmp = "";
  for (let i = 0; i < words; i++)
    cmp += `        var c${i}=T[bi+${i}]; if (w${i}<c${i}){hi=mid-1;continue;} if (w${i}>c${i}){lo=mid+1;continue;}\n`;
  const search = `      var lo=0, hi=nt-1;
      while (lo <= hi) {
        var mid=(lo+hi)>>1, bi=mid*${words};
${cmp}        onHit(String.fromCharCode(${ptBytes.join(", ")}), mid); break;
      }`;

  const pbArgs = positions.map((_, i) => `PB${i}`).join(", ");
  const src = `"use strict";
return function crack(base, count, T, nt, onHit) {
${decode}  for (var it = 0; it < count; it++) {
${msg}${spec.body()}${search}
${carry(P - 1)}  }
};`;
  return { src, pbArgs, pb: positions.map(p => p.bytes) };
}

// Compile the kernel for use on this thread. A worker instead ships {src,pbArgs}
// to its own scope and compiles there (the pattern-specific code as text, so no
// module import is needed inside the worker).
export function buildCpuKernel(positions, hash) {
  const { src, pbArgs, pb } = buildCpuKernelSource(positions, hash);
  return new Function(pbArgs, src)(...pb);
}

// Work-slice size: ~1M candidates (~0.1s at 10 MH/s), so the main thread yields
// between slices to stay live; a worker uses it as its message granularity.
export const SLICE = 1 << 20;
