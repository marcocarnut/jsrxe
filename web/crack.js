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
// This file is a code generator, nothing more: it knows odometers and MD5, not
// rxe. The spike it grew from is jsrxe/spike/webgpu-md5.html.

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

// ---- MD5 in WGSL, scalarized (from the spike) ---------------------------
function roundSpec(i) {
  let g, mkF;
  if (i < 16)      { g = i;             mkF = w => `(B${w} & C${w}) | (~B${w} & D${w})`; }
  else if (i < 32) { g = (5*i+1) & 15;  mkF = w => `(D${w} & B${w}) | (~D${w} & C${w})`; }
  else if (i < 48) { g = (3*i+5) & 15;  mkF = w => `B${w} ^ C${w} ^ D${w}`; }
  else             { g = (7*i)   & 15;  mkF = w => `C${w} ^ (B${w} | ~D${w})`; }
  return { g, mkF, s: MD5_S[i], k: MD5_K[i] >>> 0 };
}
const md5Round = (i, w) => {
  const r = roundSpec(i);
  return `    { let ff = (${r.mkF(w)}) + A${w} + ${r.k}u + m${w}_${r.g}; let rb = B${w} + ((ff << ${r.s}u) | (ff >> ${32-r.s}u)); A${w} = D${w}; D${w} = C${w}; C${w} = B${w}; B${w} = rb; }\n`;
};
const md5Init = w => `    var A${w}: u32 = 0x67452301u; var B${w}: u32 = 0xefcdab89u; var C${w}: u32 = 0x98badcfeu; var D${w}: u32 = 0x10325476u;\n`;
const md5Digest = (w, fw) => fw
  ? `    let dg${w} = rev(A${w}+0x67452301u);\n`
  : `    let dg${w} = vec4<u32>(rev(A${w}+0x67452301u), rev(B${w}+0xefcdab89u), rev(C${w}+0x98badcfeu), rev(D${w}+0x10325476u));\n`;

// Per-hash facts: digest length, how many u32 words the sorted target holds, the
// candidate ceiling one block allows, and the WGSL that hashes a lane. MD5 is
// the only one wired now; the others slot in beside it (step 4).
const HASHES = {
  md5: {
    hexlen: 32, words: 4, maxWidth: 55,
    round: md5Round, init: md5Init, digest: md5Digest,
    rounds: 64,
    firstWord: true,          // word A finalizes at round 60; 61-63 are dead code
  },
};

// ---- the candidate-laying codegen ---------------------------------------

// Byte at absolute position `a` for lane w. An inner position's byte comes from
// its decoded digit (arithmetic if the alphabet is contiguous, else a baked
// table); an outer position's byte is a constant the host wrote into the prefix
// uniform, read back word-aligned.
// The prefix uniform word at constant index k, and byte at constant index a --
// baked to constant array/component indices so the compiler folds them, rather
// than a runtime function with dynamic uniform indexing.
const pfxWordExpr = (k) => `P.pfx[${k >> 2}u][${k & 3}u]`;
const pfxByteExpr = (a) => { const w = a >> 2; return `((${pfxWordExpr(w)} >> ${(a & 3) * 8}u) & 0xffu)`; };

function candByte(A, w, a) {
  const p = A.posAt[a];                 // which position owns byte a
  const pos = A.positions[p];
  const k = a - pos.off;                // which byte of that position
  if (p < A.split) return pfxByteExpr(a);         // outer: from the prefix uniform
  if (pos.L === 1 && pos.contig) return `(${pos.bytes[0]}u + e${w}_${p})`;   // inner contiguous class
  if (pos.L === 1)               return `AP${p}[e${w}_${p}]`;                // inner tabled class
  return `AP${p}[e${w}_${p} * ${pos.L}u + ${k}u]`;   // inner multi-byte alternative
}

// MD5 message word m{w}_{k}: the four candidate bytes at 4k..4k+3, or the pad /
// length words. A word entirely inside the host prefix is that prefix word
// verbatim; otherwise it is folded from candByte, and the +0 pad past the
// candidate lets the compiler drop the dead words.
function msgWord(A, w, k, width) {
  if (k === 14) return `${width*8}u`;
  if (k === 15) return `0u`;
  const base = 4*k;
  if (base + 4 <= A.prefixBytes) return pfxWordExpr(k);   // wholly in the prefix
  const terms = [];
  for (let t = 0; t < 4; t++) {
    const a = base + t; let term;
    if (a < width) term = candByte(A, w, a);
    else if (a === width) term = `0x80u`;
    else continue;
    terms.push(t === 0 ? term : `(${term} << ${8*t}u)`);
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

// Decode lane w's index into its inner-position digits e{p}, then the message
// words as scalars, then the hash state.
function laneBuild(A, w, idxExpr, width, H) {
  let s = `\n    var q${w} = ${idxExpr};\n`;
  // Least-significant inner position varies fastest: peel digits from the end.
  for (let p = A.positions.length - 1; p >= A.split; p--) {
    s += `    let e${w}_${p} = q${w} % ${A.positions[p].n}u;`;
    if (p > A.split) s += ` q${w} = q${w} / ${A.positions[p].n}u;`;
    s += `\n`;
  }
  for (let k = 0; k < 16; k++) s += `    let m${w}_${k} = ${msgWord(A, w, k, width)};\n`;
  s += H.init(w);
  return s;
}

// Shader head: bindings, the prefix accessors, rev(), and a const table per
// tabled inner position. Everything else is baked, so nothing here varies at
// runtime except the target list and the per-dispatch prefix.
function shaderHead(A, H) {
  let tables = "";
  for (let p = A.split; p < A.positions.length; p++) {
    const pos = A.positions[p];
    const tabled = !(pos.L === 1 && pos.contig);
    if (!tabled) continue;
    const vals = Array.from(pos.bytes).map(b => `${b}u`).join(",");
    tables += `const AP${p} = array<u32, ${pos.bytes.length}>(${vals});\n`;
  }
  return `
struct Params { loN: u32, ntgt: u32, wbytes: u32, _pad: u32, pfx: array<vec4<u32>, 4> };
@group(0) @binding(0) var<storage, read>       targets : array<u32>;
@group(0) @binding(1) var<storage, read_write> hitcount: atomic<u32>;
@group(0) @binding(2) var<storage, read_write> hits    : array<u32>;
@group(0) @binding(3) var<uniform>             P       : Params;
fn rev(x: u32) -> u32 { return ((x & 0xffu) << 24u) | ((x & 0xff00u) << 8u) | ((x >> 8u) & 0xff00u) | ((x >> 24u) & 0xffu); }
${tables}`;
}

// Binary-search the sorted targets for digest dg; on a hit store the plaintext
// (two packed words) and the target index. In first-word mode dg is one u32 and
// the host re-hashes to confirm; otherwise it is the full digest, H.words wide.
function searchRecord(A, w, dg, guard, width, fw, H) {
  const p0 = packBytes(A, w, 0, 4, width), p1 = packBytes(A, w, 4, 8, width);
  const record = `let slot = atomicAdd(&hitcount, 1u);
          if (slot < ${MAXHITS}u) { hits[slot*4u + 0u] = ${p0}; hits[slot*4u + 1u] = ${p1}; hits[slot*4u + 2u] = u32(mid); }`;
  const inner = fw
    ? `let tw = targets[u32(mid) * ${H.words}u];
        if (${dg} == tw) { ${record} break; }
        if (${dg} < tw) { hi = mid - 1; } else { lo = mid + 1; }`
    : `let base = u32(mid) * ${H.words}u; var cmp: i32 = 0;
        for (var k: u32 = 0u; k < ${H.words}u; k++) {
          if (${dg}[k] != targets[base + k]) { cmp = select(1, -1, ${dg}[k] < targets[base + k]); break; }
        }
        if (cmp == 0) { ${record} break; }
        if (cmp < 0) { hi = mid - 1; } else { lo = mid + 1; }`;
  return `
    if (${guard}) {
      var lo: i32 = 0; var hi: i32 = i32(P.ntgt) - 1;
      loop {
        if (lo > hi) { break; }
        let mid = (lo + hi) / 2; ${inner}
      }
    }`;
}

function rounds(H, w) { let s = ""; for (let i = 0; i < H.rounds; i++) s += H.round(i, w); return s; }

// Serial kernel: one candidate per grid-stride step.
function serialShader(A, wg, width, fw, H) {
  const rec = searchRecord(A, 0, "dg0", "true", width, fw, H);
  return shaderHead(A, H) + `
@compute @workgroup_size(${wg})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let stride = nwg.x * ${wg}u;
  var j = gid.x;
  loop {
    if (j >= P.loN) { break; }
${laneBuild(A, 0, "j", width, H)}${rounds(H, 0)}${H.digest(0, fw)}${rec}
    j = j + stride;
  }
}`;
}

// Interleaved kernel: W independent candidates advanced round-by-round together,
// so the GPU overlaps their dependency chains instead of stalling on one.
function interleavedShader(A, wg, W, width, fw, H) {
  let body = "";
  for (let w = 0; w < W; w++) body += laneBuild(A, w, `j + ${w}u * stride`, width, H) + "\n";
  for (let i = 0; i < H.rounds; i++) for (let w = 0; w < W; w++) body += H.round(i, w);
  for (let w = 0; w < W; w++)
    body += H.digest(w, fw) + searchRecord(A, w, `dg${w}`, `j${w} < P.loN`, width, fw, H) + "\n";
  // Each lane needs its own bounds var j{w}; derive them up front.
  let jvars = "";
  for (let w = 0; w < W; w++) jvars += `    let j${w} = j + ${w}u * stride;\n`;
  // laneBuild already reads "j + w*stride"; expose j{w} only for the guard.
  return shaderHead(A, H) + `
@compute @workgroup_size(${wg})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let stride = nwg.x * ${wg}u;
  var j = gid.x;
  loop {
    if (j >= P.loN) { break; }
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

// Crack a fixed-width odometer pattern on the GPU. `plan` is engine.wheelPlan();
// `targets` the pasted digest lines; `knobs` the tuning; onProgress(frac, rate)
// is called between dispatches. `control` (optional) pauses and stops the run
// between dispatches: control.stopped() ends it, await control.gate() blocks
// while paused. Resolves to { hits: [{hex, plaintext}], rate, total, supported,
// stopped } or { supported:false, reason }.
export async function runCrack({ plan, hash = "md5", targets, knobs = {}, onProgress, control }) {
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
  const fw = H.firstWord && !!knobs.fw;
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
  const wgroups = Math.min(Math.max(1, Math.ceil(innerN / (wg * denom))), cap);

  // Host outer enumeration: the positions [0, split) as a mixed-radix counter,
  // most-significant first. outerN is a BigInt (it is the whole keyspace / innerN).
  const outer = A.positions.slice(0, A.split);
  let outerN = 1n; for (const p of outer) outerN *= BigInt(p.n);

  const ab = new ArrayBuffer(U);
  const uScal = new Uint32Array(ab, 0, 4);
  const uBytes = new Uint8Array(ab, 16, PFX_WORDS * 4);
  uScal[0] = innerN >>> 0; uScal[1] = ntgt; uScal[2] = A.width;

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

  let r = 0, stopped = false, pausedMs = 0;
  for (let oi = 0n; oi < outerN; oi++) {
    if (control && control.stopped()) { stopped = true; break; }
    setPrefix(oi);
    device.queue.writeBuffer(rings[r].u, 0, ab);
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, rings[r].b);
    pass.dispatchWorkgroups(wgroups);
    pass.end();
    device.queue.submit([enc.finish()]);
    done += BigInt(innerN);
    r = (r + 1) % RING;
    // Yield every RING dispatches (or at the end) so the browser stays live and
    // the GPU queue does not run unbounded ahead of the host. This is also the
    // pause/stop point: a paused run drains the queue and waits at the gate,
    // and the paused time is discounted so the reported rate stays honest.
    if (r === 0 || oi + 1n === outerN) {
      await device.queue.onSubmittedWorkDone();
      if (onProgress) {
        const secs = (performance.now() - t0) / 1000 - pausedMs / 1000;
        onProgress(Number(done * 100000n / total) / 100000, Number(done) / secs);
      }
      await new Promise(res => setTimeout(res));
      if (control) {
        if (control.stopped()) { stopped = true; break; }
        if (control.paused && control.paused()) {
          const pt = performance.now();
          await control.gate();
          pausedMs += performance.now() - pt;
          if (control.stopped()) { stopped = true; break; }
        }
      }
    }
  }
  await device.queue.onSubmittedWorkDone();
  const secs = (performance.now() - t0) / 1000 - pausedMs / 1000;
  const rate = Number(done) / secs;

  // Read back the hits.
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(bCnt, 0, bReadCnt, 0, 4);
  enc.copyBufferToBuffer(bHit, 0, bReadHit, 0, MAXHITS*4*4);
  device.queue.submit([enc.finish()]);
  await bReadCnt.mapAsync(GPUMapMode.READ); await bReadHit.mapAsync(GPUMapMode.READ);
  const nhits = new Uint32Array(bReadCnt.getMappedRange())[0];
  const hitData = new Uint32Array(bReadHit.getMappedRange().slice(0));
  bReadCnt.unmap(); bReadHit.unmap();
  device.destroy();

  const got = Math.min(nhits, MAXHITS);
  const hits = []; let bogus = 0;
  const tgtHex = new Set(rows.map(r => r.hex));
  for (let i = 0; i < got; i++) {
    const p0 = hitData[i*4], p1 = hitData[i*4+1], midx = hitData[i*4+2];
    let s = "";
    for (let k = 0; k < A.width; k++) { const wd = k < 4 ? p0 : p1; s += String.fromCharCode((wd >> (8*(k%4))) & 0xff); }
    if (fw) {
      const full = cpuHash(hash, s);
      if (tgtHex.has(full)) hits.push({ hex: full, plaintext: s }); else bogus++;
    } else {
      hits.push({ hex: rows[midx].hex, plaintext: s });
    }
  }
  hits.sort((a, b) => a.plaintext < b.plaintext ? -1 : 1);
  return { supported: true, hits, rate, total, ntgt, raw: nhits, capped: nhits > MAXHITS, bogus, fw, stopped };
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
export async function runCrackCPU({ plan, hash = "md5", targets, onProgress, control }) {
  const H = HASHES[hash];
  if (!H) return { supported: false, reason: `${hash} not wired yet` };
  const fp = analyzePlan(plan, hash);
  if (!fp.ok) return { supported: false, reason: fp.reason };
  const rows = parseTargets(targets, H);
  if (!rows.length) return { supported: true, empty: true };
  const want = new Map(rows.map(r => [r.hex, r.hex]));
  const total = fp.total, positions = fp.positions;
  const hits = []; const seen = new Set();
  const t0 = performance.now();
  let stopped = false;
  for (let gi = 0n; gi < total; gi++) {
    const s = layCandidate(positions, gi);
    const dg = cpuHash(hash, s);
    if (want.has(dg) && !seen.has(dg)) { seen.add(dg); hits.push({ hex: dg, plaintext: s }); }
    if ((gi & 0x3ffffn) === 0n) {
      if (control && control.stopped()) { stopped = true; break; }
      if (onProgress) onProgress(Number(gi * 100000n / total) / 100000, Number(gi) / ((performance.now()-t0)/1000 || 1));
      await new Promise(res => setTimeout(res));
      if (control && control.paused && control.paused()) { await control.gate(); if (control.stopped()) { stopped = true; break; } }
    }
  }
  hits.sort((a, b) => a.plaintext < b.plaintext ? -1 : 1);
  const rate = Number(total) / ((performance.now() - t0) / 1000 || 1);
  return { supported: true, hits, rate, total, ntgt: rows.length, raw: hits.length, capped: false, bogus: 0, fw: false, stopped };
}

// A tiny CPU hash, only to confirm first-word-mode hits (WebCrypto has no MD5).
function cpuHash(hash, str) {
  if (hash === "md5") return md5hex(str);
  return "";
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
