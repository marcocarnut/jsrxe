import { LANGS, makeT, translateError } from "./i18n.js";
import { BUILTIN } from "./patterns.js";

/* ----------------------------------------------------------- worker plumbing */

const worker = new Worker("worker.js", { type: "module" });
let ready = false, seq = 0;
const pending = new Map();

worker.onmessage = (ev) => {
  if (ev.data.fatal) { showFatal(ev.data.fatal); return; }
  if (ev.data.ready) { ready = true; onReady(); return; }
  const { id, ...rest } = ev.data;
  const resolve = pending.get(id);
  if (resolve) { pending.delete(id); resolve(rest); }
};

function showFatal(msg) {
  const el = $("err");
  el.textContent = msg;
  el.hidden = false;
}

function call(type, args = {}) {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    worker.postMessage({ id, type, ...args });
  });
}

/* ------------------------------------------------------------------- state */

const $ = (id) => document.getElementById(id);
const STORE_LANG = "jsrxe.lang";
const STORE_MINE = "jsrxe.examples";

let lang = localStorage.getItem(STORE_LANG) ||
           (navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
if (!LANGS[lang]) lang = "en";
let t = makeT(lang);

let state = {
  ok: false, infinite: false, shortlex: false, count: null,
  from: 0n, per: 50, zeroBased: true, keyActive: false, filter: "all",
  selected: null
};

let mine = [];
try { mine = JSON.parse(localStorage.getItem(STORE_MINE) || "[]"); } catch { mine = []; }

/* --------------------------------------------------------------- utilities */

// Thousands separators on an arbitrarily long decimal string. Intl cannot be
// used here: these numbers routinely have thousands of digits, far past what
// a Number holds, and the whole point is to show them exactly.
function group(s) {
  const sep = lang === "pt" ? "." : ",";
  let out = "", n = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    out = s[i] + out;
    if (++n % 3 === 0 && i > 0) out = sep + out;
  }
  return out;
}

// log10 and log2 of a decimal string, without turning it into a Number.
function logs(s) {
  const digits = s.length;
  const lead = Number(s.slice(0, 17)) || 1;
  const log10 = Math.log10(lead) + (digits - Math.min(17, digits));
  return { log10, log2: log10 / Math.log10(2) };
}

function isExactPower(s, base) {
  let v;
  try { v = BigInt(s); } catch { return false; }
  if (v <= 0n) return false;
  const b = BigInt(base);
  while (v % b === 0n) v /= b;
  return v === 1n;
}

function show(el, on) { el.hidden = !on; }

// Members can hold any byte, including control characters. Render those
// visibly rather than letting them disappear into the markup.
function renderValue(s) {
  if (s === "") return `<span class="dim">${t("emptyString")}</span>`;
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c === 127) out += `<span class="ctrl">\\x${c.toString(16).padStart(2, "0")}</span>`;
    else if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === " ") out += `<span class="sp"> </span>`;
    else out += ch;
  }
  return out;
}

/* ------------------------------------------------------------------ i18n UI */

function applyLanguage() {
  t = makeT(lang);
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  for (const el of document.querySelectorAll("[data-t]"))
    el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll("[data-tplace]"))
    el.placeholder = t(el.dataset.tplace);
  renderLibrary();
  renderNote();
  renderCount();
  renderOrder();
  renderRows(lastRows);
}

/* --------------------------------------------------------- example library */

function allExamples() {
  return BUILTIN.concat(mine.map((m) => ({ ...m, own: true })));
}

function exampleName(ex) {
  return typeof ex.name === "string" ? ex.name : (ex.name[lang] || ex.name.en);
}

function exampleNote(ex) {
  if (!ex.note) return "";
  return typeof ex.note === "string" ? ex.note : (ex.note[lang] || ex.note.en);
}

// Which bucket an example goes in. The library is the authority on whether an
// expression is infinite, so this asks it rather than guessing from the text;
// until it has answered, a starred quantifier is a good enough guess for
// sorting a list.
function looksInfinite(ex) {
  if ("infinite" in ex) return ex.infinite;
  return /[*+]|\{\s*\d+\s*,\s*\}/.test(ex.pattern);
}

function renderLibrary() {
  const q = $("libsearch").value.trim().toLowerCase();
  const list = $("liblist");
  list.innerHTML = "";
  for (const ex of allExamples()) {
    if (state.filter === "mine" && !ex.own) continue;
    if (state.filter === "finite" && looksInfinite(ex)) continue;
    if (state.filter === "infinite" && !looksInfinite(ex)) continue;
    const name = exampleName(ex);
    if (q && !name.toLowerCase().includes(q) &&
        !ex.pattern.toLowerCase().includes(q)) continue;

    const li = document.createElement("li");
    if (state.selected === ex.id) li.className = "on";
    li.innerHTML =
      `<button class="pick"><span class="nm"></span><code></code></button>` +
      (ex.own ? `<button class="del" title="${t("deleteOne")}">&times;</button>` : "");
    li.querySelector(".nm").textContent = name;
    li.querySelector("code").textContent = ex.pattern;
    li.querySelector(".pick").onclick = () => selectExample(ex);
    if (ex.own) li.querySelector(".del").onclick = () => {
      if (!confirm(t("deleteConfirm"))) return;
      mine = mine.filter((m) => m.id !== ex.id);
      localStorage.setItem(STORE_MINE, JSON.stringify(mine));
      renderLibrary();
    };
    list.appendChild(li);
  }
}

function selectExample(ex) {
  state.selected = ex.id;
  $("pattern").value = ex.pattern;
  $("fi").checked = (ex.flags || "").includes("i");
  $("fs").checked = (ex.flags || "").includes("s");
  $("fL").checked = (ex.flags || "").includes("L");
  $("from").value = "0";
  $("key").value = "";
  state.from = 0n;
  renderLibrary();
  renderNote();
  reparse();
}

function renderNote() {
  const ex = allExamples().find((e) => e.id === state.selected);
  const note = ex ? exampleNote(ex) : "";
  $("note").textContent = note;
  show($("note"), !!note);
}

/* ---------------------------------------------------------------- parsing */

function currentFlags() {
  return ($("fi").checked ? "i" : "") + ($("fs").checked ? "s" : "") +
         ($("fL").checked ? "L" : "");
}

let reparseTimer = null;
function scheduleReparse() {
  clearTimeout(reparseTimer);
  reparseTimer = setTimeout(reparse, 250);
}

async function reparse() {
  if (!ready) return;
  const pattern = $("pattern").value;
  if (!pattern) { state.ok = false; renderAll(); return; }
  const r = await call("parse", { pattern, flags: currentFlags() });
  state.ok = r.ok;
  if (!r.ok) {
    $("err").textContent = t("parseError") + ": " + translateError(r.error, lang);
    show($("err"), true);
    state.count = null;
    renderAll();
    return;
  }
  show($("err"), false);
  state.infinite = r.infinite;
  state.shortlex = r.shortlex;
  state.count = r.count;
  await applyKey();
  renderAll();
  loadLengths();
  loadRows();
}

async function applyKey() {
  const key = $("key").value.trim();
  if (key && state.infinite) {
    $("err").textContent = t("keyNeedsFinite");
    show($("err"), true);
    state.keyActive = false;
    await call("key", { key: "", count: null });
    return;
  }
  const r = await call("key", { key, count: state.count });
  state.keyActive = !!r.active;
}

/* ---------------------------------------------------------------- rendering */

function renderAll() {
  renderCount();
  renderOrder();
  const finite = state.ok && !state.infinite && state.count && state.count !== "0";
  show($("slider"), finite);
  $("last").disabled = !finite;
  $("random").disabled = !finite;
}

function renderCount() {
  const el = $("count"), ap = $("approx");
  if (!state.ok) { el.textContent = ""; ap.textContent = ""; return; }
  if (state.infinite) {
    el.textContent = t("sizeInfinite");
    ap.textContent = "";
    return;
  }
  if (state.count === "0") { el.textContent = t("sizeEmpty"); ap.textContent = ""; return; }
  el.textContent = group(state.count);
  const { log10, log2 } = logs(state.count);
  const p10 = isExactPower(state.count, 10) ? "=" : "~";
  const p2 = isExactPower(state.count, 2) ? "=" : "~";
  ap.textContent = `${p10} 10^${log10.toFixed(4)}   ${p2} 2^${log2.toFixed(4)}`;
}

function renderOrder() {
  const el = $("order"), h = $("orderhint");
  if (!state.ok) { el.textContent = ""; h.textContent = ""; return; }
  if (state.shortlex) { el.textContent = t("orderShortlex"); h.textContent = t("orderShortlexHint"); }
  else if (state.infinite) { el.textContent = t("orderDiagonal"); h.textContent = t("orderDiagonalHint"); }
  else { el.textContent = t("orderPlace"); h.textContent = t("orderPlaceHint"); }
}

async function loadLengths() {
  const box = $("lengths");
  if (!state.ok) { box.innerHTML = ""; return; }
  const r = await call("lengths", { max: 24 });
  const counts = r.counts || [];
  const nums = counts.map((c) => { const { log10 } = logs(c === "0" ? "1" : c); return c === "0" ? 0 : log10; });
  const peak = Math.max(1, ...nums);
  let html = "";
  for (let L = 0; L < counts.length; L++) {
    if (counts[L] === "0" && L > 0 && counts.slice(L).every((c) => c === "0")) break;
    const w = counts[L] === "0" ? 0 : Math.max(1, (nums[L] / peak) * 100);
    html += `<div class="lrow"><span class="ll">${L}</span>` +
            `<span class="lbar" style="width:${w.toFixed(1)}%"></span>` +
            `<span class="lc">${group(counts[L])}</span></div>`;
  }
  box.innerHTML = html;
}

let lastRows = [];

function renderRows(rows) {
  lastRows = rows;
  const body = $("results").querySelector("tbody");
  const off = state.zeroBased ? 0n : 1n;
  body.innerHTML = rows.map((r) =>
    `<tr><td class="ix">${group((BigInt(r.index) + off).toString())}</td>` +
    `<td class="val">${renderValue(r.value)}</td></tr>`).join("");
  $("status").textContent = rows.length ? "" : (state.ok ? t("pastEnd") : "");
}

async function loadRows() {
  if (!state.ok) { renderRows([]); return; }
  const r = await call("rows", { from: state.from.toString(), n: state.per });
  renderRows(r.rows || []);
  syncSlider();
}

function syncSlider() {
  if (state.infinite || !state.count || state.count === "0") return;
  const total = BigInt(state.count);
  const pos = total <= 1n ? 0 :
    Number((state.from * 10000n) / (total > 1n ? total - 1n : 1n));
  $("slider").value = String(Math.max(0, Math.min(10000, pos)));
}

/* ------------------------------------------------------------- navigation */

function setFrom(v) {
  state.from = v < 0n ? 0n : v;
  $("from").value = (state.from + (state.zeroBased ? 0n : 1n)).toString();
  loadRows();
}

function wire() {
  $("lang").innerHTML = Object.entries(LANGS)
    .map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  $("lang").value = lang;
  $("lang").onchange = () => {
    lang = $("lang").value;
    localStorage.setItem(STORE_LANG, lang);
    applyLanguage();
  };

  $("pattern").oninput = () => { state.selected = null; renderNote(); renderLibrary(); scheduleReparse(); };
  for (const f of ["fi", "fs", "fL"]) $(f).onchange = reparse;
  $("key").oninput = () => { clearTimeout(reparseTimer); reparseTimer = setTimeout(async () => { await applyKey(); loadRows(); }, 250); };

  $("per").onchange = () => {
    state.per = Math.max(1, Math.min(1000, Number($("per").value) || 50));
    $("per").value = String(state.per);
    loadRows();
  };
  $("zero").onchange = () => {
    state.zeroBased = $("zero").checked;
    $("from").value = (state.from + (state.zeroBased ? 0n : 1n)).toString();
    renderRows(lastRows);
  };
  $("from").onchange = () => {
    let v;
    try { v = BigInt($("from").value.replace(/[^0-9]/g, "") || "0"); } catch { return; }
    setFrom(v - (state.zeroBased ? 0n : 1n));
  };

  $("first").onclick = () => setFrom(0n);
  $("prev").onclick = () => setFrom(state.from - BigInt(state.per));
  $("next").onclick = () => setFrom(state.from + BigInt(state.per));
  $("last").onclick = () => {
    if (!state.count) return;
    setFrom(BigInt(state.count) - BigInt(state.per));
  };
  $("random").onclick = async () => {
    if (!state.count || state.count === "0") return;
    const r = await call("random", { count: state.count, n: state.per });
    renderRows(r.rows || []);
  };

  $("slider").oninput = () => {
    if (!state.count) return;
    const total = BigInt(state.count);
    const frac = BigInt($("slider").value);
    setFrom((total - 1n) * frac / 10000n);
  };

  // The wheel moves the window rather than a scrollbar, because the index
  // range is routinely larger than any scrollable height a browser will make.
  $("results").onwheel = (e) => {
    if (!state.ok) return;
    e.preventDefault();
    const step = BigInt(Math.max(1, Math.round(state.per / 5)));
    setFrom(e.deltaY > 0 ? state.from + step : state.from - step);
  };

  $("libsearch").oninput = renderLibrary;
  for (const b of document.querySelectorAll("#libtabs .tab")) b.onclick = () => {
    state.filter = b.dataset.filter;
    for (const o of document.querySelectorAll("#libtabs .tab")) o.classList.toggle("on", o === b);
    renderLibrary();
  };

  $("addown").onclick = () => {
    const ex = allExamples().find((e) => e.id === state.selected);
    $("savename").value = ex ? exampleName(ex) : "";
    $("savenote").value = "";
    $("savebox").showModal();
  };
  $("savebox").addEventListener("close", () => {
    if ($("savebox").returnValue !== "save") return;
    const name = $("savename").value.trim();
    if (!name) return;
    mine.push({
      id: "own-" + Date.now(),
      pattern: $("pattern").value,
      flags: currentFlags(),
      name, note: $("savenote").value.trim(),
      infinite: state.infinite
    });
    localStorage.setItem(STORE_MINE, JSON.stringify(mine));
    state.filter = "mine";
    for (const o of document.querySelectorAll("#libtabs .tab"))
      o.classList.toggle("on", o.dataset.filter === "mine");
    renderLibrary();
  });
}

function onReady() {
  if ($("pattern").value) reparse();
  else selectExample(BUILTIN[0]);
}

wire();
applyLanguage();
