// GPU keycracking in the browser, from an rxe wheel plan.
//
// The library hands us a pattern's odometer (web/engine.js wheelPlan, which is
// rxe_lay's decomposition -- the very wheels the native JIT compiles). Here we
// JIT a WebGPU compute shader that lays those candidates on the GPU and hashes
// them, the same trick rxejit -G does with OpenCL. One GPU lane per candidate,
// grid-strided; the odometer's low positions are swept on the device (a u32
// index), its high positions enumerated on the host so each dispatch stays
// inside 32-bit arithmetic (WGSL has no u64). No candidate ever crosses the
// wasm boundary -- only the plan does.
//
// This file is a code generator, nothing more: it knows odometers and hashes,
// not rxe. The spike it grew from is jsrxe/spike/webgpu-md5.html.

import { sha256 } from "./sha256.js";

const MAXHITS = 1024;
const RING = 8;                 // uniform buffers in flight, so the host never stalls the GPU
const PFX_WORDS = 16;           // prefix (host-enumerated) bytes, as u32 words: 64 bytes, one MD5 block

// ---- MD5 constants ------------------------------------------------------
const MD5_K = [
 0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
 0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
 0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
 0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
 0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
 0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
 0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
 0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391];
const MD5_S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
 5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
 4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
 6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];

// ---- the plan: which patterns the fast odometer path handles -------------

// Turn a raw wheel plan into fixed positions the kernel can lay, or a reason it
// cannot. The fast path is a pure product of fixed-width positions: no super-
// wheel (a large repeat or a {{...}} choice -- the hybrid path's job), no
// backreference, every wheel fixed width, and a candidate that fits one hash
// block. Each position becomes {n, L, off, bytes, contig}.
export function analyzePlan(plan, hash) {
  if (!plan || !plan.ok) return { ok: false, reason: plan && plan.reason || "no plan" };
  if (plan.hasBackref)   return { ok: false, reason: "a backreference" };
  if (plan.lr && plan.lr.active)   return { ok: false, reason: "a large variable-count repeat (hybrid path, coming soon)" };
  if (plan.perm && plan.perm.active) return { ok: false, reason: "a combinatorial {{...}} choice (hybrid path, coming soon)" };
  if (!plan.wheels || !plan.wheels.length) return { ok: false, reason: "an empty pattern" };

  const positions = [];
  let off = 0;
  for (const w of plan.wheels) {
    if (w.L === 0) return { ok: false, reason: "a variable-width position, e.g. (cat|fish)" };
    const bytes = Uint8Array.from(w.bytes);
    // Contiguous single-byte alphabets (a class like [a-z]) lay by arithmetic;
    // anything else (a jumbled class, a multi-byte alternative) by table.
    let contig = w.L === 1;
    for (let i = 1; contig && i < w.n; i++) if (bytes[i] !== bytes[0] + i) contig = false;
    positions.push({ n: w.n, L: w.L, off, bytes, contig });
    off += w.L;
  }
  const width = off;
  const maxWidth = HASHES[hash].maxWidth;
  if (width > maxWidth)
    return { ok: false, reason: `${width} bytes wide; the GPU ${hash} kernel handles up to ${maxWidth}` };

  // Total candidate count, as BigInt (it routinely exceeds 2^53).
  let total = 1n;
  for (const p of positions) total *= BigInt(p.n);
  return { ok: true, positions, width, total };
}

// The host/GPU split: take positions from the end (least significant) until the
// product of their radii would exceed the GPU's 32-bit budget; those are swept
// on the device, the rest enumerated on the host. Returns the index of the
// first inner position. A single position bigger than the budget still works --
// it becomes the only inner one and its own dispatch covers 2^32 at a time is
// not needed here since one wheel's n never exceeds ALT_CAP (65536).
// Candidates per dispatch. Big enough that per-dispatch host/drain overhead is
// amortised -- small dispatches (the earlier 2^28 forced [a-z]{7} to 26^5 =
// 12M, 676 dispatches) leave the GPU idle across ~85 pipeline drains and swamp
// the compute, which also hides the knobs. 2^30 keeps [a-z]{7} at 26^6 = 309M,
// 26 dispatches, matching the spike; still < 2^32 so lanes stay u32.
const GPU_BUDGET = 1 << 30;
function splitPositions(positions) {
  let inner = 1, split = positions.length;
  while (split > 0) {
    const n = positions[split - 1].n;
    if (inner * n > GPU_BUDGET) break;
    inner *= n; split--;
  }
  // Always sweep at least one position on the GPU, even if it alone exceeds the
  // budget (n <= 65536 < 2^32, so a single wheel is always safe).
  if (split === positions.length && positions.length) { split--; inner = positions[split].n; }
  return { split, innerN: inner };
}

// ---- the hashes in WGSL -------------------------------------------------
// Each hash lays the same candidate (candByte), differs only in how the 16
// message words are assembled (endianness, and NTLM's UTF-16LE widening) and in
// its compression. A compress(w, fw) emits the per-lane rounds and defines the
// digest words dg{w}_0.. ; first-word mode keeps only dg{w}_0 and the host
// re-hashes to confirm (MD5/NTLM only -- SHA's word 0 needs every round).

const rotl = (x, c) => `((${x} << ${c}u) | (${x} >> ${32 - c}u))`;
const rotr = (x, c) => `((${x} >> ${c}u) | (${x} << ${32 - c}u))`;

function roundSpec(i) {                 // MD5 per-round facts
  let g, mkF;
  if (i < 16)      { g = i;             mkF = w => `(B${w} & C${w}) | (~B${w} & D${w})`; }
  else if (i < 32) { g = (5*i+1) & 15;  mkF = w => `(D${w} & B${w}) | (~D${w} & C${w})`; }
  else if (i < 48) { g = (3*i+5) & 15;  mkF = w => `B${w} ^ C${w} ^ D${w}`; }
  else             { g = (7*i)   & 15;  mkF = w => `C${w} ^ (B${w} | ~D${w})`; }
  return { g, mkF, s: MD5_S[i], k: MD5_K[i] >>> 0 };
}
const MD_IV = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];

function md5Compress(w, fw) {
  let s = `    var A${w}=0x67452301u; var B${w}=0xefcdab89u; var C${w}=0x98badcfeu; var D${w}=0x10325476u;\n`;
  for (let i = 0; i < 64; i++) {
    const r = roundSpec(i);
    s += `    { let ff = (${r.mkF(w)}) + A${w} + ${r.k}u + m${w}_${r.g}; let rb = B${w} + ${rotl("ff", r.s)}; A${w}=D${w}; D${w}=C${w}; C${w}=B${w}; B${w}=rb; }\n`;
  }
  const reg = ["A","B","C","D"], n = fw ? 1 : 4;
  for (let i = 0; i < n; i++) s += `    let dg${w}_${i} = rev(${reg[i]}${w} + ${MD_IV[i]>>>0}u);\n`;
  return s;
}

// MD4 (NTLM), 48 rounds. Destination register cycles A,D,C,B; its three inputs
// are the next three in A,B,C,D order. Round groups F/G/H differ in the mixing
// function, the added constant, and the message-word order and shifts.
function md4Compress(w, fw) {
  const R = ["A","B","C","D"], dest = [0,3,2,1];
  let s = `    var A${w}=0x67452301u; var B${w}=0xefcdab89u; var C${w}=0x98badcfeu; var D${w}=0x10325476u;\n`;
  const emit = (ff, kArr, sArr, add) => {
    for (let j = 0; j < 16; j++) {
      const d = dest[j % 4];
      const dr = R[d]+w, b1 = R[(d+1)%4]+w, b2 = R[(d+2)%4]+w, b3 = R[(d+3)%4]+w;
      const addc = add ? ` + ${add>>>0}u` : "";
      s += `    ${dr} = ${rotl(`(${dr} + (${ff(b1,b2,b3)}) + m${w}_${kArr[j]}${addc})`, sArr[j%4])};\n`;
    }
  };
  const F=(x,y,z)=>`(${x} & ${y}) | (~${x} & ${z})`;
  const G=(x,y,z)=>`(${x} & ${y}) | (${x} & ${z}) | (${y} & ${z})`;
  const H4=(x,y,z)=>`${x} ^ ${y} ^ ${z}`;
  emit(F, [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [3,7,11,19], 0);
  emit(G, [0,4,8,12,1,5,9,13,2,6,10,14,3,7,11,15], [3,5,9,13], 0x5a827999);
  emit(H4,[0,8,4,12,2,10,6,14,1,9,5,13,3,11,7,15], [3,9,11,15], 0x6ed9eba1);
  const reg = ["A","B","C","D"], n = fw ? 1 : 4;
  for (let i = 0; i < n; i++) s += `    let dg${w}_${i} = rev(${reg[i]}${w} + ${MD_IV[i]>>>0}u);\n`;
  return s;
}

const SHA1_IV = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
// Unrolled, with the message schedule as SSA scalars W{w}_i rather than an array
// -- each is live only from its definition to its last use, so the compiler
// keeps them in registers instead of spilling a fixed 80-word buffer.
function sha1Compress(w) {              // 20-byte digest, big-endian, no first-word
  const R = ["a","b","c","d","e"];
  let s = "";
  for (let i = 0; i < 16; i++) s += `    let W${w}_${i} = m${w}_${i};\n`;
  for (let i = 16; i < 80; i++)
    s += `    let W${w}_${i} = ${rotl(`(W${w}_${i-3} ^ W${w}_${i-8} ^ W${w}_${i-14} ^ W${w}_${i-16})`, 1)};\n`;
  s += `    var a${w}=${SHA1_IV[0]>>>0}u; var b${w}=${SHA1_IV[1]>>>0}u; var c${w}=${SHA1_IV[2]>>>0}u; var d${w}=${SHA1_IV[3]>>>0}u; var e${w}=${SHA1_IV[4]>>>0}u;\n`;
  for (let i = 0; i < 80; i++) {
    let f, k;
    if (i < 20)      { f = `(b${w} & c${w}) | (~b${w} & d${w})`;                     k = 0x5a827999; }
    else if (i < 40) { f = `b${w} ^ c${w} ^ d${w}`;                                  k = 0x6ed9eba1; }
    else if (i < 60) { f = `(b${w} & c${w}) | (b${w} & d${w}) | (c${w} & d${w})`;    k = 0x8f1bbcdc; }
    else             { f = `b${w} ^ c${w} ^ d${w}`;                                  k = 0xca62c1d6; }
    s += `    { let t = ${rotl(`a${w}`,5)} + (${f}) + e${w} + ${k>>>0}u + W${w}_${i}; e${w}=d${w}; d${w}=c${w}; c${w}=${rotl(`b${w}`,30)}; b${w}=a${w}; a${w}=t; }\n`;
  }
  for (let i = 0; i < 5; i++) s += `    let dg${w}_${i} = ${SHA1_IV[i]>>>0}u + ${R[i]}${w};\n`;
  return s;
}

const SHA256_IV = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
const SHA256_K = [
 0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
 0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
 0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
 0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
 0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
 0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
 0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
 0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function sha256Compress(w) {            // 32-byte digest, big-endian, no first-word
  const R = ["a","b","c","d","e","f","g","h"];
  let s = "";
  for (let i = 0; i < 16; i++) s += `    let W${w}_${i} = m${w}_${i};\n`;
  for (let i = 16; i < 64; i++) {
    const x = `W${w}_${i-15}`, y = `W${w}_${i-2}`;
    const s0 = `(${rotr(x,7)} ^ ${rotr(x,18)} ^ (${x} >> 3u))`;
    const s1 = `(${rotr(y,17)} ^ ${rotr(y,19)} ^ (${y} >> 10u))`;
    s += `    let W${w}_${i} = W${w}_${i-16} + ${s0} + W${w}_${i-7} + ${s1};\n`;
  }
  s += `    var a${w}=${SHA256_IV[0]>>>0}u; var b${w}=${SHA256_IV[1]>>>0}u; var c${w}=${SHA256_IV[2]>>>0}u; var d${w}=${SHA256_IV[3]>>>0}u; var e${w}=${SHA256_IV[4]>>>0}u; var f${w}=${SHA256_IV[5]>>>0}u; var g${w}=${SHA256_IV[6]>>>0}u; var h${w}=${SHA256_IV[7]>>>0}u;\n`;
  for (let i = 0; i < 64; i++) {
    s += `    { let S1 = ${rotr(`e${w}`,6)} ^ ${rotr(`e${w}`,11)} ^ ${rotr(`e${w}`,25)};`
       + ` let ch = (e${w} & f${w}) ^ (~e${w} & g${w});`
       + ` let t1 = h${w} + S1 + ch + ${SHA256_K[i]>>>0}u + W${w}_${i};`
       + ` let S0 = ${rotr(`a${w}`,2)} ^ ${rotr(`a${w}`,13)} ^ ${rotr(`a${w}`,22)};`
       + ` let maj = (a${w} & b${w}) ^ (a${w} & c${w}) ^ (b${w} & c${w});`
       + ` let t2 = S0 + maj;`
       + ` h${w}=g${w}; g${w}=f${w}; f${w}=e${w}; e${w}=d${w}+t1; d${w}=c${w}; c${w}=b${w}; b${w}=a${w}; a${w}=t1+t2; }\n`;
  }
  for (let i = 0; i < 8; i++) s += `    let dg${w}_${i} = ${SHA256_IV[i]>>>0}u + ${R[i]}${w};\n`;
  return s;
}

// Per-hash facts: digest hex length, u32 words in a digest, the candidate ceiling
// one block allows, message-word endianness, NTLM's UTF-16LE widening, the round
// count, whether first-word compare is sound, the WGSL compressor, and the CPU
// oracle (also the fallback, and what confirms a first-word hit).
const HASHES = {
  md5:    { hexlen: 32, words: 4, maxWidth: 55, endian: "le", widen: false, firstWord: true,  compress: md5Compress,    cpu: (s) => md5hex(s) },
  ntlm:   { hexlen: 32, words: 4, maxWidth: 27, endian: "le", widen: true,  firstWord: true,  compress: md4Compress,    cpu: (s) => ntlmhex(s) },
  sha1:   { hexlen: 40, words: 5, maxWidth: 55, endian: "be", widen: false, firstWord: false, compress: sha1Compress,   cpu: (s) => sha1hex(s) },
  sha256: { hexlen: 64, words: 8, maxWidth: 55, endian: "be", widen: false, firstWord: false, compress: sha256Compress, cpu: (s) => sha256(s) },
};

// ---- the candidate-laying codegen ---------------------------------------

// The prefix uniform word at constant index k, and byte at constant index a --
// baked to constant array/component indices so the compiler folds them, rather
// than a runtime function with dynamic uniform indexing.
const pfxWordExpr = (k) => `P.pfx[${k >> 2}u][${k & 3}u]`;
const pfxByteExpr = (a) => { const w = a >> 2; return `((${pfxWordExpr(w)} >> ${(a & 3) * 8}u) & 0xffu)`; };

// Byte at absolute candidate position `a` for lane w: an inner position's byte
// (arithmetic for a contiguous class, else a baked table), or an outer one from
// the prefix uniform.
function candByte(A, w, a) {
  const p = A.posAt[a];
  const pos = A.positions[p];
  const k = a - pos.off;
  if (p < A.split) return pfxByteExpr(a);
  if (pos.L === 1 && pos.contig) return `(${pos.bytes[0]}u + e${w}_${p})`;
  if (pos.L === 1)               return `AP${p}[e${w}_${p}]`;
  return `AP${p}[e${w}_${p} * ${pos.L}u + ${k}u]`;
}

// The byte at message position `p` (already the UTF-16LE-widened message when
// widen): a candidate byte, the 0x80 pad, or null for a zero the caller drops.
function msgByte(A, w, p, width, H) {
  if (H.widen) {
    const elen = 2 * width;
    if (p < elen) return (p & 1) ? null : candByte(A, w, p >> 1);
    return p === elen ? `0x80u` : null;
  }
  if (p < width) return candByte(A, w, p);
  return p === width ? `0x80u` : null;
}

// Message word k: the four bytes at 4k..4k+3 in the hash's endianness, or the
// bit-length word (word 14 little-endian, word 15 big-endian). Zero bytes past
// the pad are dropped so the compiler folds the dead words.
function msgWord(A, w, k, width, H) {
  const elen = (H.widen ? 2 * width : width) * 8;
  if (H.endian === "le") { if (k === 14) return `${elen>>>0}u`; if (k === 15) return `0u`; }
  else                   { if (k === 14) return `0u`; if (k === 15) return `${elen>>>0}u`; }
  const terms = [];
  for (let t = 0; t < 4; t++) {
    const bv = msgByte(A, w, 4*k + t, width, H);
    if (bv === null) continue;
    const shift = H.endian === "le" ? 8*t : 8*(3-t);
    terms.push(shift ? `((${bv}) << ${shift}u)` : `(${bv})`);
  }
  return terms.length ? terms.join(" | ") : `0u`;
}

// Pack candidate bytes [lo,hi) little-endian, for a hit record's plaintext.
function packBytes(A, w, lo, hi, width) {
  const terms = [];
  for (let a = lo; a < Math.min(hi, width); a++) {
    const cb = candByte(A, w, a);
    terms.push(a === lo ? cb : `(${cb} << ${8*(a-lo)}u)`);
  }
  return terms.length ? terms.join(" | ") : `0u`;
}

// Decode lane w's index into its inner-position digits, then the 16 message
// words as scalars. The hash's compress() takes it from there.
function laneBuild(A, w, idxExpr, width, H) {
  let s = `\n    var q${w} = ${idxExpr};\n`;
  for (let p = A.positions.length - 1; p >= A.split; p--) {
    s += `    let e${w}_${p} = q${w} % ${A.positions[p].n}u;`;
    if (p > A.split) s += ` q${w} = q${w} / ${A.positions[p].n}u;`;
    s += `\n`;
  }
  for (let k = 0; k < 16; k++) s += `    let m${w}_${k} = ${msgWord(A, w, k, width, H)};\n`;
  return s;
}

// Shader head: bindings, rev(), any hash constants, and a const table per tabled
// inner position.
function shaderHead(A, H) {
  let tables = "";
  for (let p = A.split; p < A.positions.length; p++) {
    const pos = A.positions[p];
    if (pos.L === 1 && pos.contig) continue;
    tables += `const AP${p} = array<u32, ${pos.bytes.length}>(${Array.from(pos.bytes).map(b => `${b}u`).join(",")});\n`;
  }
  return `
struct Params { lo: u32, hi: u32, ntgt: u32, _pad: u32, pfx: array<vec4<u32>, 4> };
@group(0) @binding(0) var<storage, read>       targets : array<u32>;
@group(0) @binding(1) var<storage, read_write> hitcount: atomic<u32>;
@group(0) @binding(2) var<storage, read_write> hits    : array<u32>;
@group(0) @binding(3) var<uniform>             P       : Params;
fn rev(x: u32) -> u32 { return ((x & 0xffu) << 24u) | ((x & 0xff00u) << 8u) | ((x >> 8u) & 0xff00u) | ((x >> 24u) & 0xffu); }
${H.consts || ""}${tables}`;
}

// Binary-search the sorted targets for lane w's digest words dg{w}_0.. and, on a
// hit, store the plaintext (two packed words) and the target row. `ndg` words
// are compared (all, or just word 0 in first-word mode); the digest is stored as
// H.words per row, so word 0 sits at mid*H.words.
function searchRecord(A, w, width, ndg, H, guard) {
  const p0 = packBytes(A, w, 0, 4, width), p1 = packBytes(A, w, 4, 8, width);
  const record = `let slot = atomicAdd(&hitcount, 1u);
          if (slot < ${MAXHITS}u) { hits[slot*4u + 0u] = ${p0}; hits[slot*4u + 1u] = ${p1}; hits[slot*4u + 2u] = u32(mid); }`;
  let chain = "";
  for (let k = 0; k < ndg; k++) {
    const dg = `dg${w}_${k}`, tg = `targets[base + ${k}u]`;
    chain += `${k === 0 ? "        if" : "        else if"} (${dg} < ${tg}) { cmp = -1; }\n`;
    chain += `        else if (${dg} > ${tg}) { cmp = 1; }\n`;
  }
  const search = `
    {
      var lo: i32 = 0; var hi: i32 = i32(P.ntgt) - 1;
      loop {
        if (lo > hi) { break; }
        let mid = (lo + hi) / 2;
        let base = u32(mid) * ${H.words}u; var cmp: i32 = 0;
${chain}        if (cmp == 0) { ${record} break; }
        if (cmp < 0) { hi = mid - 1; } else { lo = mid + 1; }
      }
    }`;
  return guard === "true" ? search : `\n    if (${guard}) {${search}\n    }`;
}

function laneKernel(A, w, idxExpr, width, fw, H, guard) {
  const ndg = fw ? 1 : H.words;
  return laneBuild(A, w, idxExpr, width, H) + H.compress(w, fw) + searchRecord(A, w, width, ndg, H, guard);
}

// Serial kernel: one candidate per grid-stride step.
function serialShader(A, wg, width, fw, H) {
  return shaderHead(A, H) + `
@compute @workgroup_size(${wg})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let stride = nwg.x * ${wg}u;
  var j = P.lo + gid.x;
  loop {
    if (j >= P.hi) { break; }
${laneKernel(A, 0, "j", width, fw, H, "true")}
    j = j + stride;
  }
}`;
}

// Interleaved kernel: W independent candidates per step, so their dependency
// chains overlap instead of stalling one at a time.
function interleavedShader(A, wg, W, width, fw, H) {
  let jvars = "", body = "";
  for (let w = 0; w < W; w++) {
    jvars += `    let j${w} = j + ${w}u * stride;\n`;
    body += laneKernel(A, w, `j${w}`, width, fw, H, `j${w} < P.hi`) + "\n";
  }
  return shaderHead(A, H) + `
@compute @workgroup_size(${wg})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let stride = nwg.x * ${wg}u;
  var j = P.lo + gid.x;
  loop {
    if (j >= P.hi) { break; }
${jvars}${body}    j = j + ${W}u * stride;
  }
}`;
}

// ---- host driver --------------------------------------------------------

const cmpWords = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };

// Parse the pasted digests into sorted, deduped big-endian u32 rows.
function parseTargets(lines, H) {
  const re = new RegExp(`^[0-9a-f]{${H.hexlen}}$`);
  let rows = lines.map(s => s.trim().toLowerCase()).filter(s => re.test(s)).map(h => {
    const w = [];
    for (let i = 0; i < H.words; i++) w.push((parseInt(h.substr(i*8, 8), 16)) >>> 0);
    return { w, hex: h };
  });
  rows.sort((a, b) => cmpWords(a.w, b.w));
  rows = rows.filter((r, i) => i === 0 || cmpWords(r.w, rows[i-1].w) !== 0);
  return rows;
}

// Build the analysis object the codegen reads: positions, split, byte->position
// map, and the prefix byte count.
function buildA(fp) {
  const { split } = splitPositions(fp.positions);
  const posAt = [];
  fp.positions.forEach((p, i) => { for (let k = 0; k < p.L; k++) posAt[p.off + k] = i; });
  const prefixBytes = split > 0 ? fp.positions[split].off : 0;
  const innerN = fp.positions.slice(split).reduce((a, p) => a * p.n, 1);
  return { positions: fp.positions, split, posAt, prefixBytes, innerN, width: fp.width, total: fp.total };
}

// The generated WGSL for a plan + hash, for tests and debugging. { code, A } or
// { error }.
export function buildShader({ plan, hash = "md5", knobs = {} }) {
  const H = HASHES[hash];
  if (!H) return { error: `${hash} not wired` };
  const fp = analyzePlan(plan, hash);
  if (!fp.ok) return { error: fp.reason };
  const A = buildA(fp);
  const fw = H.firstWord;   // always on -- helps MD5/NTLM, ignored by SHA
  const wg = knobs.wg || 256, W = knobs.ww || 4;
  const code = knobs.mode === "interleaved"
    ? interleavedShader(A, wg, W, A.width, fw, H)
    : serialShader(A, wg, A.width, fw, H);
  return { code, A };
}

// Crack a fixed-width odometer pattern on the GPU. `plan` is engine.wheelPlan();
// `targets` the pasted digest lines; `knobs` the tuning; onProgress(frac, rate)
// is called between dispatches. `control` (optional) pauses and stops the run
// between dispatches: control.stopped() ends it, await control.gate() blocks
// while paused. Resolves to { hits: [{hex, plaintext}], rate, total, supported,
// stopped } or { supported:false, reason }.
export async function runCrack({ plan, hash = "md5", targets, knobs = {}, onProgress, onHit, control }) {
  const H = HASHES[hash];
  if (!H) return { supported: false, reason: `${hash} not wired yet` };
  const fp = analyzePlan(plan, hash);
  if (!fp.ok) return { supported: false, reason: fp.reason };
  if (!navigator.gpu) return { supported: false, reason: "no WebGPU" };

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { supported: false, reason: "no GPU adapter" };
  const device = await adapter.requestDevice();

  const rows = parseTargets(targets, H);
  if (!rows.length) return { supported: true, empty: true };
  const ntgt = rows.length;
  const tgtArr = new Uint32Array(ntgt * H.words);
  rows.forEach((r, i) => tgtArr.set(r.w, i * H.words));

  const A = buildA(fp);
  const wg = knobs.wg || 256, cap = knobs.cap || 8192;
  const mode = knobs.mode || "serial", W = knobs.ww || 4;
  const fw = H.firstWord;   // always on -- helps MD5/NTLM, ignored by SHA
  const code = mode === "serial" ? serialShader(A, wg, A.width, fw, H)
                                 : interleavedShader(A, wg, W, A.width, fw, H);
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter(m => m.type === "error");
  if (errs.length) return { supported: false, reason: `shader: ${errs[0].message} (line ${errs[0].lineNum})`, code };
  const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "main" } });

  const U = 16 + PFX_WORDS * 4;         // uniform bytes: 4 scalars + prefix words
  const bTgt = device.createBuffer({ size: tgtArr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(bTgt, 0, tgtArr);
  const bCnt = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
  const bHit = device.createBuffer({ size: MAXHITS*4*4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const bReadCnt = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const bReadHit = device.createBuffer({ size: MAXHITS*4*4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(bCnt, 0, new Uint32Array([0]));

  const rings = Array.from({ length: RING }, () => {
    const u = device.createBuffer({ size: U, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const b = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: bTgt } }, { binding: 1, resource: { buffer: bCnt } },
      { binding: 2, resource: { buffer: bHit } }, { binding: 3, resource: { buffer: u } } ] });
    return { u, b };
  });

  const innerN = A.innerN;
  const denom = mode === "serial" ? 1 : W;

  // Host outer enumeration: the positions [0, split) as a mixed-radix counter,
  // most-significant first. outerN is a BigInt (it is the whole keyspace / innerN).
  const outer = A.positions.slice(0, A.split);
  let outerN = 1n; for (const p of outer) outerN *= BigInt(p.n);

  const ab = new ArrayBuffer(U);
  const uScal = new Uint32Array(ab, 0, 4);
  const uBytes = new Uint8Array(ab, 16, PFX_WORDS * 4);
  uScal[2] = ntgt;                       // lo (base) and hi are set per chunk below

  const t0 = performance.now();
  let done = 0n;
  const total = fp.total;
  // Fill the prefix bytes for outer counter value `oi` (BigInt).
  const digits = new Array(outer.length);
  const setPrefix = (oi) => {
    let x = oi;
    for (let i = outer.length - 1; i >= 0; i--) { const n = BigInt(outer[i].n); digits[i] = Number(x % n); x /= n; }
    uBytes.fill(0);
    for (let i = 0; i < outer.length; i++) {
      const p = outer[i], d = digits[i];
      for (let k = 0; k < p.L; k++) uBytes[p.off + k] = p.bytes[d * p.L + k];
    }
  };

  const tgtHex = new Set(rows.map(r => r.hex));
  const hits = [], foundHex = new Set();
  let processed = 0, bogus = 0, lastNhits = 0;

  // Read the hit buffer, decode records [processed, nhits), confirm (first-word)
  // and stream each newly-cracked target through onHit. Called at every drain so
  // results appear as they are found, not at the end -- and so a run can stop the
  // instant every target is cracked.
  async function drainHits() {
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(bCnt, 0, bReadCnt, 0, 4);
    device.queue.submit([enc.finish()]);
    await bReadCnt.mapAsync(GPUMapMode.READ);
    const nhits = new Uint32Array(bReadCnt.getMappedRange())[0];
    bReadCnt.unmap();
    lastNhits = nhits;
    const got = Math.min(nhits, MAXHITS);
    if (got <= processed) return;
    const enc2 = device.createCommandEncoder();
    enc2.copyBufferToBuffer(bHit, 0, bReadHit, 0, MAXHITS*4*4);
    device.queue.submit([enc2.finish()]);
    await bReadHit.mapAsync(GPUMapMode.READ);
    const hitData = new Uint32Array(bReadHit.getMappedRange().slice(0));
    bReadHit.unmap();
    for (let i = processed; i < got; i++) {
      const p0 = hitData[i*4], p1 = hitData[i*4+1], midx = hitData[i*4+2];
      let s = "";
      for (let k = 0; k < A.width; k++) { const wd = k < 4 ? p0 : p1; s += String.fromCharCode((wd >> (8*(k%4))) & 0xff); }
      let hex;
      if (fw) { const full = cpuHash(hash, s); if (!tgtHex.has(full)) { bogus++; continue; } hex = full; }
      else hex = rows[midx].hex;
      if (foundHex.has(hex)) continue;               // the same target laid twice
      foundHex.add(hex);
      const hit = { hex, plaintext: s };
      hits.push(hit);
      if (onHit) onHit(hit);
    }
    processed = got;
  }

  // Adaptive dispatch size: sub-divide each prefix's inner sweep into chunks
  // aimed at ~CHUNK_SEC of GPU work, so progress and hits refresh several times a
  // second and the first (small) chunk lands almost at once -- while a fast hash
  // still gets chunks large enough to amortise the per-dispatch overhead. The
  // size steers itself from the rate the last chunk actually ran at.
  const CHUNK_SEC = 0.2, CHUNK_MIN = 1 << 20, CHUNK_MAX = 1 << 30;
  let chunk = 1 << 22;
  let r = 0, stopped = false, allFound = false, pausedMs = 0;

  outer:
  for (let oi = 0n; oi < outerN; oi++) {
    if (control && control.stopped()) { stopped = true; break; }
    setPrefix(oi);
    for (let base = 0; base < innerN; base += chunk) {
      const hi = Math.min(base + chunk, innerN), count = hi - base;
      uScal[0] = base; uScal[1] = hi;
      device.queue.writeBuffer(rings[r].u, 0, ab);
      const wgroups = Math.min(Math.max(1, Math.ceil(count / (wg * denom))), cap);
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, rings[r].b);
      pass.dispatchWorkgroups(wgroups);
      pass.end();
      device.queue.submit([enc.finish()]);
      const tc = performance.now();
      await device.queue.onSubmittedWorkDone();
      const dt = performance.now() - tc;
      done += BigInt(count);
      r = (r + 1) % RING;
      await drainHits();
      if (foundHex.size >= ntgt) { allFound = true; break outer; }   // every target cracked -- stop early
      if (dt > 0) chunk = Math.max(CHUNK_MIN, Math.min(CHUNK_MAX, Math.round(count / (dt/1000) * CHUNK_SEC)));
      if (onProgress) {
        const secs = (performance.now() - t0) / 1000 - pausedMs / 1000;
        const rate = Number(done) / secs, eta = rate > 0 ? Number(total - done) / rate : Infinity;
        onProgress(Number(done * 100000n / total) / 100000, rate, eta);
      }
      await new Promise(res => setTimeout(res));
      if (control) {
        if (control.stopped()) { stopped = true; break outer; }
        if (control.paused && control.paused()) {
          const pt = performance.now();
          await control.gate();
          pausedMs += performance.now() - pt;
          if (control.stopped()) { stopped = true; break outer; }
        }
      }
    }
  }
  await device.queue.onSubmittedWorkDone();
  await drainHits();                                  // catch any hit from the final chunk
  const secs = (performance.now() - t0) / 1000 - pausedMs / 1000;
  const rate = Number(done) / secs;
  device.destroy();

  hits.sort((a, b) => a.plaintext < b.plaintext ? -1 : 1);
  return { supported: true, hits, rate, total, ntgt, raw: lastNhits, capped: lastNhits > MAXHITS,
           bogus, fw, stopped, allFound };
}

// ---- CPU reference / fallback ------------------------------------------

// Lay the candidate at global index `gi` (a BigInt): decode the odometer most-
// significant position first (position 0), and pick each position's alternative
// bytes. The independent twin of the GPU lay -- a set no GPU touched, so a run
// that agrees with the CPU here has both paths landing on the same members.
function layCandidate(positions, gi) {
  const digits = new Array(positions.length);
  let x = gi;
  for (let p = positions.length - 1; p >= 0; p--) { const n = BigInt(positions[p].n); digits[p] = Number(x % n); x /= n; }
  let s = "";
  for (let p = 0; p < positions.length; p++) {
    const pos = positions[p], d = digits[p];
    for (let k = 0; k < pos.L; k++) s += String.fromCharCode(pos.bytes[d * pos.L + k]);
  }
  return s;
}

// Crack a fixed-width odometer on the CPU: the same set the GPU would sweep,
// hashed in JS. Slow (this is the no-WebGPU fallback, and the headless oracle
// the tests check the GPU path's plan against), but exact. Same result shape as
// runCrack. Yields every ~200k candidates so the page stays live.
export async function runCrackCPU({ plan, hash = "md5", targets, onProgress, onHit, control }) {
  const H = HASHES[hash];
  if (!H) return { supported: false, reason: `${hash} not wired yet` };
  const fp = analyzePlan(plan, hash);
  if (!fp.ok) return { supported: false, reason: fp.reason };
  const rows = parseTargets(targets, H);
  if (!rows.length) return { supported: true, empty: true };
  const want = new Set(rows.map(r => r.hex)), ntgt = rows.length;
  const total = fp.total, positions = fp.positions;
  const hits = [], seen = new Set();
  const t0 = performance.now();
  let stopped = false, allFound = false, done = 0n;
  for (let gi = 0n; gi < total; gi++) {
    const s = layCandidate(positions, gi);
    const dg = cpuHash(hash, s);
    if (want.has(dg) && !seen.has(dg)) {
      seen.add(dg); const hit = { hex: dg, plaintext: s }; hits.push(hit);
      if (onHit) onHit(hit);
      if (seen.size >= ntgt) { done = gi + 1n; allFound = true; break; }   // stop the instant all are cracked
    }
    if ((gi & 0x3ffffn) === 0n) {
      done = gi;
      if (control && control.stopped()) { stopped = true; break; }
      if (onProgress) {
        const rate = Number(gi) / ((performance.now()-t0)/1000 || 1);
        onProgress(Number(gi * 100000n / total) / 100000, rate, rate > 0 ? Number(total - gi) / rate : Infinity);
      }
      await new Promise(res => setTimeout(res));
      if (control && control.paused && control.paused()) { await control.gate(); if (control.stopped()) { stopped = true; break; } }
    }
  }
  if (!stopped && !allFound) done = total;
  hits.sort((a, b) => a.plaintext < b.plaintext ? -1 : 1);
  const rate = Number(done) / ((performance.now() - t0) / 1000 || 1);
  return { supported: true, hits, rate, total, ntgt, raw: hits.length, capped: false, bogus: 0, fw: false, stopped, allFound };
}

// The CPU hash (WebCrypto has none of these synchronously): confirms a first-
// word hit, and hashes every candidate in the no-WebGPU fallback. All are single
// block, which every fast-path candidate is (maxWidth <= 55).
function cpuHash(hash, str) { return HASHES[hash].cpu(str); }

// MD4 of a byte array (NTLM's inner hash), one block.
function md4hex(bytes) {
  const u = x => x>>>0, rol = (x,c) => u((x << c) | (x >>> (32-c)));
  const N = bytes.length, m = new Array(16).fill(0);
  for (let i = 0; i < N; i++) m[i>>2] = u(m[i>>2] | (bytes[i] << (8*(i&3))));
  m[N>>2] = u(m[N>>2] | (0x80 << (8*(N&3))));
  m[14] = u(N*8);
  let a=0x67452301,b=0xefcdab89,c=0x98badcfe,d=0x10325476;
  const a0=a,b0=b,c0=c,d0=d;
  const F=(x,y,z)=>(x&y)|(~x&z), G=(x,y,z)=>(x&y)|(x&z)|(y&z), Hh=(x,y,z)=>x^y^z;
  const ff=(a,b,c,d,k,s)=>rol(u(a+F(b,c,d)+m[k]),s);
  const gg=(a,b,c,d,k,s)=>rol(u(a+G(b,c,d)+m[k]+0x5a827999),s);
  const hh=(a,b,c,d,k,s)=>rol(u(a+Hh(b,c,d)+m[k]+0x6ed9eba1),s);
  a=ff(a,b,c,d,0,3);  d=ff(d,a,b,c,1,7);  c=ff(c,d,a,b,2,11);  b=ff(b,c,d,a,3,19);
  a=ff(a,b,c,d,4,3);  d=ff(d,a,b,c,5,7);  c=ff(c,d,a,b,6,11);  b=ff(b,c,d,a,7,19);
  a=ff(a,b,c,d,8,3);  d=ff(d,a,b,c,9,7);  c=ff(c,d,a,b,10,11); b=ff(b,c,d,a,11,19);
  a=ff(a,b,c,d,12,3); d=ff(d,a,b,c,13,7); c=ff(c,d,a,b,14,11); b=ff(b,c,d,a,15,19);
  a=gg(a,b,c,d,0,3);  d=gg(d,a,b,c,4,5);  c=gg(c,d,a,b,8,9);   b=gg(b,c,d,a,12,13);
  a=gg(a,b,c,d,1,3);  d=gg(d,a,b,c,5,5);  c=gg(c,d,a,b,9,9);   b=gg(b,c,d,a,13,13);
  a=gg(a,b,c,d,2,3);  d=gg(d,a,b,c,6,5);  c=gg(c,d,a,b,10,9);  b=gg(b,c,d,a,14,13);
  a=gg(a,b,c,d,3,3);  d=gg(d,a,b,c,7,5);  c=gg(c,d,a,b,11,9);  b=gg(b,c,d,a,15,13);
  a=hh(a,b,c,d,0,3);  d=hh(d,a,b,c,8,9);  c=hh(c,d,a,b,4,11);  b=hh(b,c,d,a,12,15);
  a=hh(a,b,c,d,2,3);  d=hh(d,a,b,c,10,9); c=hh(c,d,a,b,6,11);  b=hh(b,c,d,a,14,15);
  a=hh(a,b,c,d,1,3);  d=hh(d,a,b,c,9,9);  c=hh(c,d,a,b,5,11);  b=hh(b,c,d,a,13,15);
  a=hh(a,b,c,d,3,3);  d=hh(d,a,b,c,11,9); c=hh(c,d,a,b,7,11);  b=hh(b,c,d,a,15,15);
  a=u(a+a0);b=u(b+b0);c=u(c+c0);d=u(d+d0);
  const rev = x => u(((x&0xff)<<24)|((x&0xff00)<<8)|((x>>>8)&0xff00)|((x>>>24)&0xff));
  return [rev(a),rev(b),rev(c),rev(d)].map(x => u(x).toString(16).padStart(8,"0")).join("");
}
// NTLM: MD4 of the password widened to UTF-16LE (each byte, then a zero).
function ntlmhex(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) { bytes.push(str.charCodeAt(i) & 0xff, 0); }
  return md4hex(bytes);
}
// SHA-1 of a string's bytes, one block. Big-endian words and digest.
function sha1hex(str) {
  const u = x => x>>>0, rol = (x,c) => u((x << c) | (x >>> (32-c)));
  const N = str.length, w = new Array(80).fill(0);
  for (let i = 0; i < N; i++) w[i>>2] = u(w[i>>2] | ((str.charCodeAt(i) & 0xff) << (8*(3-(i&3)))));
  w[N>>2] = u(w[N>>2] | (0x80 << (8*(3-(N&3)))));
  w[15] = u(N*8);
  for (let i = 16; i < 80; i++) w[i] = rol(u(w[i-3]^w[i-8]^w[i-14]^w[i-16]), 1);
  let a=0x67452301,b=0xefcdab89,c=0x98badcfe,d=0x10325476,e=0xc3d2e1f0;
  for (let i = 0; i < 80; i++) {
    let f, k;
    if (i<20) { f=(b&c)|(~b&d); k=0x5a827999; }
    else if (i<40) { f=b^c^d; k=0x6ed9eba1; }
    else if (i<60) { f=(b&c)|(b&d)|(c&d); k=0x8f1bbcdc; }
    else { f=b^c^d; k=0xca62c1d6; }
    const t = u(rol(a,5) + f + e + k + w[i]); e=d; d=c; c=rol(b,30); b=a; a=t;
  }
  a=u(a+0x67452301);b=u(b+0xefcdab89);c=u(c+0x98badcfe);d=u(d+0x10325476);e=u(e+0xc3d2e1f0);
  return [a,b,c,d,e].map(x => u(x).toString(16).padStart(8,"0")).join("");
}
function md5hex(str) {
  const u = x => x >>> 0, rol = (x,c) => u((x << c) | (x >>> (32 - c)));
  const cand = [...str].map(c => c.charCodeAt(0)), N = cand.length;
  const m = new Array(16).fill(0);
  for (let w = 0; w < 14; w++) { let word = 0; for (let t = 0; t < 4; t++) { const p = w*4+t; let b = 0; if (p < N) b = cand[p]; else if (p === N) b = 0x80; word = u(word | (b << (8*t))); } m[w] = word; }
  m[14] = u(N*8); m[15] = 0;
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476; const a0=a,b0=b,c0=c,d0=d;
  for (let i = 0; i < 64; i++) { let f, g;
    if (i < 16) { f = u((b&c)|(~b&d)); g = i; }
    else if (i < 32) { f = u((d&b)|(~d&c)); g = (5*i+1)&15; }
    else if (i < 48) { f = u(b^c^d); g = (3*i+5)&15; }
    else { f = u(c^(b|~d)); g = (7*i)&15; }
    const ff = u(f + a + MD5_K[i] + m[g]); a = d; d = c; c = b; b = u(b + rol(ff, MD5_S[i])); }
  a=u(a+a0); b=u(b+b0); c=u(c+c0); d=u(d+d0);
  const rev = x => u(((x&0xff)<<24)|((x&0xff00)<<8)|((x>>>8)&0xff00)|((x>>>24)&0xff));
  return [rev(a),rev(b),rev(c),rev(d)].map(w => (w>>>0).toString(16).padStart(8,"0")).join("");
}
