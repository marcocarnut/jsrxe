// Validate the incremental JS-CPU kernels (perm/combo + policy) against librxe's
// own member enumeration -- the ground truth. For each pattern we ask the engine
// for every member, hash them, and confirm runCpuFast (which now routes perm/
// policy through the JIT'd incremental kernels) finds exactly that set with the
// right plaintexts. Then a windowed order check at arbitrary offsets (fetched
// from the engine by index) confirms the incremental odometer visits members in
// the engine's own index order -- even deep into a keyspace too big to enumerate.

import { randomFillSync } from "node:crypto";
import createLibrxe from "../build/librxe-node.mjs";
import { makeEngine } from "../web/engine.js";
import { makeTransform } from "../web/sandbox.js";
import { runCpuFast, analyzeGeneric, cpuHash } from "../web/crack.js";
import { buildPermKernelSource, buildPolicyKernelSource } from "../web/crackcpu.js";

const Module = await createLibrxe();
const e = makeEngine(Module, { randomBytes: (n) => randomFillSync(new Uint8Array(n)), makeTransform });

let pass = 0, fail = 0;
function ok(what, cond) { if (cond) pass++; else { fail++; console.log(`FAIL  ${what}`); } }

// crack.js's (non-exported) CPU data builders, copied for the raw-kernel order
// check. The full-set check exercises the real ones via runCpuFast.
function policyCpuData(fp) {
  const po = fp.policy, K = po.k, H1 = po.H1, nseg = po.nseg;
  const segOff = new Array(nseg + 1);
  for (let i = 0; i <= nseg; i++) segOff[i] = Number(po.segOff[i]);
  const binom = new Array(H1 * H1);
  for (let a = 0; a < H1; a++) for (let b = 0; b < H1; b++) binom[a * H1 + b] = Number(po.B[a][b]);
  return { k: K, hi: po.hi, lo: po.lo, nseg, H1, segOff,
           segL: Array.from(po.segL.slice(0, nseg)), segCV: Array.from(po.segCV.slice(0, nseg * K)),
           pool: Array.from(po.bytes), sVal: Array.from(po.s), cstart: Array.from(po.cstart), binom };
}
function permCpuData(fp) {
  const pm = fp.perm, n = pm.n, HI1 = pm.hi + 1, ordered = !!pm.ordered;
  const poolArr = [], meta = new Int32Array(2 * n);
  for (let i = 0; i < n; i++) { const o = pm.itemOff(i), l = pm.itemLen(i);
    meta[2 * i] = poolArr.length; meta[2 * i + 1] = l;
    for (let k = 0; k < l; k++) poolArr.push(pm.bytes[o + k]); }
  const binom = ordered ? [] : new Array((n + 1) * HI1);
  if (!ordered) for (let c = 0; c <= n; c++) for (let k = 0; k < HI1; k++) binom[c * HI1 + k] = Number(pm.B[c][k]);
  const blocks = [];
  for (let s = pm.lo; s <= pm.hi; s++) blocks.push(Number(pm.block(s)));
  return { n, lo: pm.lo, hi: pm.hi, ordered, chop: pm.chop | 0, maxWidth: fp.maxWidth,
           pool: Uint8Array.from(poolArr), meta, binom, blocks };
}

function parse(pattern) {
  const r = e.parse({ pattern, flags: "" });
  if (!r.ok) throw new Error(`parse failed: ${pattern} -> ${r.reason}`);
  return { count: BigInt(r.count), plan: e.wheelPlan() };
}
// members [base, base+n) as the engine renders them (indexed, no full enumeration).
function memWindow(base, n) { return e.rows({ from: String(base), n }).rows.map(x => x.value); }

const ALLH = ["md5", "ntlm", "sha1", "sha256"];

// Full-set: every engine member is found by runCpuFast with a matching plaintext.
async function fullSet(label, pattern, cap = 200000, hashes = ALLH) {
  const { count, plan } = parse(pattern);
  if (count > BigInt(cap)) { ok(`${label} within cap`, false); return; }
  const list = memWindow(0, Number(count));
  for (const hash of hashes) {
    const want = new Map();
    for (const m of list) want.set(cpuHash(hash, m), m);
    const found = new Map();
    const res = await runCpuFast({ plan, hash, targets: [...want.keys()],
                                   onHit: h => found.set(h.hex, h.plaintext) });
    if (!res.supported) { ok(`${label} [${hash}] supported (${res.reason})`, false); continue; }
    let good = found.size === want.size;
    for (const [hex, pt] of found) if (cpuHash(hash, pt) !== hex) good = false;
    for (const hex of want.keys()) if (!found.has(hex)) good = false;
    ok(`${label} [${hash}] full set (${want.size})`, good);
  }
}

// Order: drive the raw kernel over [base, base+w) and confirm it emits exactly the
// engine's members at those indices, in that order.
function orderCheck(label, pattern, bases, w) {
  const { count, plan } = parse(pattern);
  const fp = analyzeGeneric(plan, "md5");
  if (!fp.ok) { ok(`${label} analyze (${fp.reason})`, false); return; }
  const P = fp.policy ? policyCpuData(fp) : permCpuData(fp);
  const { src, pbArgs, pb } = fp.policy ? buildPolicyKernelSource(P, "md5")
                                        : buildPermKernelSource(P, "md5");
  const kern = new Function(pbArgs, src)(...pb);
  let good = true, why = "";
  for (const base of bases) {
    if (BigInt(base) >= count) continue;
    const cnt = Math.min(w, Number(count - BigInt(base)));
    const win = memWindow(base, cnt);
    const rows = win.map(m => cpuHash("md5", m)).sort();
    const uniq = [...new Set(rows)];
    const Tu = new Uint32Array(uniq.length * 4);
    uniq.forEach((hex, i) => { for (let k = 0; k < 4; k++) Tu[i * 4 + k] = parseInt(hex.substr(k * 8, 8), 16) >>> 0; });
    const emitted = [];
    kern(base, cnt, Tu, uniq.length, (pt) => emitted.push(pt));
    if (emitted.length !== cnt) { good = false; why = `@${base}: emitted ${emitted.length} != ${cnt}`; break; }
    for (let j = 0; j < cnt; j++) if (emitted[j] !== win[j]) { good = false; why = `@${base}+${j}: '${emitted[j]}' != '${win[j]}'`; break; }
    if (!good) break;
  }
  ok(`${label} order${why ? " — " + why : ""}`, good);
}

// ---- unordered combinations ----
await fullSet("comb [A-E]{{2}}", "[A-E]{{2}}");
await fullSet("comb [a-z]{{3}}", "[a-z]{{3}}");
await fullSet("comb range [a-f]{{2,3}}", "[a-f]{{2,3}}");
await fullSet("comb words (cat|fish|dog|owl){{2}}", "(cat|fish|dog|owl){{2}}");
// ---- ordered permutations ----
await fullSet("perm (S|T|O|P){{*}}", "(S|T|O|P){{*}}");
await fullSet("perm words (cat|fish|dog){{*}}", "(cat|fish|dog){{*}}");
// ---- chop (trailing-separator quell) ----
await fullSet("chop ([a-c] ){{2?}}", "([a-c] ){{2?}}");
// ---- policy ----
await fullSet("policy ([a-b]|[0-1]){{2!1,1}}", "([a-b]|[0-1]){{2!1,1}}");
await fullSet("policy ([a-c]|[0-2]){{3!1,1}}", "([a-c]|[0-2]){{3!1,1}}");

// ---- order (incremental odometer) at arbitrary offsets, incl. deep in big spaces ----
orderCheck("comb [a-z]{{4}}", "[a-z]{{4}}", [0, 1, 12345, 14949, 14950 - 20], 20);
orderCheck("perm (a|b|c|d|e){{*}}", "(a|b|c|d|e){{*}}", [0, 1, 59, 100, 119 - 5], 20);
orderCheck("policy big ([:lower:]|[:digit:]){{7!+,1}}",
           "([:lower:]|[:digit:]){{7!+,1}}", [0, 1, 1000000, 5000000000], 30);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
