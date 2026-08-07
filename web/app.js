import { LANGS, makeT, translateError } from "./i18n.js";
import { BUILTIN } from "./patterns.js";
import { makeWorkerTransport } from "./transport.js";
import { HELPER_DOCS } from "./sandbox.js";

/* --------------------------------------------------------------- transport */

// The single-file build sets this to a transport that calls the library on
// this thread, having no worker to talk to. Everything below is the same
// either way.
const transport = (globalThis.__rxeTransport || makeWorkerTransport)();
const call = transport.call;
transport.fatal((msg) => showFatal(msg));

function showFatal(msg) {
  const el = $("err");
  el.textContent = msg;
  el.hidden = false;
}

/* ------------------------------------------------------------------- state */

const $ = (id) => document.getElementById(id);
const STORE_LANG = "jsrxe.lang";
const STORE_MINE = "jsrxe.examples";
const STORE_MARKS = "jsrxe.bookmarks";

let lang = localStorage.getItem(STORE_LANG) ||
           (navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
if (!LANGS[lang]) lang = "en";
let t = makeT(lang);

let state = {
  ok: false, infinite: false, shortlex: false, count: null,
  from: 0n, per: 50, zeroBased: true, keyActive: false, filter: "all",
  selected: null, slider: "none", codeActive: false
};

let mine = [];
try { mine = JSON.parse(localStorage.getItem(STORE_MINE) || "[]"); } catch { mine = []; }

// User-added bookmarks, keyed by example id, alongside whatever the example
// itself ships. Same shape as examples: built-in plus mine, and only mine can
// be removed.
let marks = {};
try { marks = JSON.parse(localStorage.getItem(STORE_MARKS) || "{}"); } catch { marks = {}; }

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
  renderHelpers();
  renderBookmarks();
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

function exampleFamily(ex) {
  if (!ex.family) return null;
  return typeof ex.family === "string" ? ex.family : (ex.family[lang] || ex.family.en);
}

function exampleNote(ex) {
  if (!ex.note) return "";
  return typeof ex.note === "string" ? ex.note : (ex.note[lang] || ex.note.en);
}

// Which bucket an example goes in. The library is asked rather than the text
// inspected, because the text lies: '\\+55 \\d{2} 9\\d{4}-\\d{4}' is a Brazilian
// mobile number and perfectly finite, but the escaped plus in it looks exactly
// like a quantifier and had it filed under the infinite ones.
const classified = new Map();

function looksInfinite(ex) {
  if (classified.has(ex.id)) return classified.get(ex.id);
  if ("infinite" in ex) return ex.infinite;
  return false;
}

async function classifyExamples() {
  const list = allExamples().filter((e) => !classified.has(e.id));
  if (!list.length) return;
  const r = await call("classify",
                       { patterns: list.map((e) => ({ id: e.id, pattern: e.pattern })) });
  for (const c of r.classified || []) classified.set(c.id, c.infinite);
  renderLibrary();
}

function renderLibrary() {
  const q = $("libsearch").value.trim().toLowerCase();
  const list = $("liblist");
  list.innerHTML = "";
  let lastFamily = null;
  for (const ex of allExamples()) {
    if (state.filter === "mine" && !ex.own) continue;
    if (state.filter === "finite" && looksInfinite(ex)) continue;
    if (state.filter === "infinite" && !looksInfinite(ex)) continue;
    const name = exampleName(ex);
    const family = exampleFamily(ex);
    if (q && !name.toLowerCase().includes(q) &&
        !(family || "").toLowerCase().includes(q) &&
        !ex.pattern.toLowerCase().includes(q)) continue;

    // A run of examples sharing a family gets one heading, and its members
    // are shown indented beneath it: two ways of the same thing -- every CPF
    // against the valid ones, say -- read as one entry with a choice.
    if (family && family !== lastFamily) {
      const head = document.createElement("li");
      head.className = "famhead";
      head.textContent = family;
      list.appendChild(head);
    }
    lastFamily = family;

    const li = document.createElement("li");
    li.className = (family ? "child " : "") + (state.selected === ex.id ? "on" : "");
    li.innerHTML =
      `<button class="pick"><span class="nm"></span><code></code></button>` +
      (ex.own
        ? `<button class="edt" title="${t("editOne")}">&#9998;</button>` +
          `<button class="del" title="${t("deleteOne")}">&times;</button>`
        : "");
    li.querySelector(".nm").textContent = name;
    li.querySelector("code").textContent = ex.pattern;
    li.querySelector(".pick").onclick = () => selectExample(ex);
    if (ex.own) li.querySelector(".edt").onclick = () => openSaveBox(ex);
    if (ex.own) li.querySelector(".del").onclick = () => {
      if (!confirm(t("deleteConfirm"))) return;
      mine = mine.filter((m) => m.id !== ex.id);
      localStorage.setItem(STORE_MINE, JSON.stringify(mine));
      renderLibrary();
    };
    list.appendChild(li);
  }
}

// The helper reference, filled from the docs kept beside the helpers.
function renderHelpers() {
  const dl = $("helperlist");
  dl.innerHTML = HELPER_DOCS.map((h) =>
    `<dt><code>${escapeAttr(h.sig)}</code></dt>` +
    `<dd>${escapeAttr(h[lang] || h.en)}</dd>`).join("");
}

function selectExample(ex) {
  state.selected = ex.id;
  // Flags are expressed inline now, so an older example that still carries a
  // 'flags' field has it folded onto the front of the pattern as (?...).
  const inline = ex.flags ? "(?" + ex.flags + ")" : "";
  $("pattern").value = inline + ex.pattern;
  $("from").value = "0";
  $("key").value = "";
  $("code").value = ex.code || "";
  $("codepanel").open = !!ex.code;
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

// Flags are written inline in the pattern, so there is nothing to gather from
// the interface; the empty string keeps the engine's flags argument happy.
function currentFlags() { return ""; }

let reparseTimer = null;
function scheduleReparse() {
  clearTimeout(reparseTimer);
  reparseTimer = setTimeout(reparse, 250);
}

let ready = false;

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
  await applyCode();
  renderAll();
  await loadLengthStarts();
  loadRows();
}

async function applyCode() {
  const source = $("code").value.trim();
  const r = await call("code", { source });
  state.codeActive = !!r.active;
  if (r.ok) { show($("codeerr"), false); }
  else { $("codeerr").textContent = r.error; show($("codeerr"), true); }
  show($("outcol"), state.codeActive);
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
  $("last").disabled = !finite;
  $("random").disabled = !finite;
  // A finite set has a proportion to slide along. An infinite one does not,
  // but it does have lengths, and stepping by those is both the coarse
  // movement that is otherwise missing and a fair picture of how the set is
  // actually arranged -- far better than laying an arbitrary exponential
  // scale over an index with no end.
  if (finite) {
    state.slider = "proportion";
    $("slider").max = "10000";
    $("sliderhint").textContent = t("sliderHintFinite");
    show($("coarse"), true);
    syncSlider();
  } else if (state.ok && state.infinite) {
    state.slider = "length";
    $("slider").max = String(Math.max(1, lengthStarts.length - 1));
    $("slider").value = "0";
    $("sliderhint").textContent = t("sliderHintLength");
    show($("coarse"), lengthStarts.length > 1);
  } else {
    show($("coarse"), false);
  }
}

// The index at which each length begins, for the length slider. Empty until
// the expression is known to be infinite.
let lengthStarts = [];

async function loadLengthStarts() {
  lengthStarts = [];
  if (!state.ok || !state.infinite) return;
  const r = await call("lengthStarts", { max: 96 });
  lengthStarts = r.starts || [];
  renderAll();
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

let lastRows = [];

function renderRows(rows) {
  lastRows = rows;
  const body = $("results").querySelector("tbody");
  const off = state.zeroBased ? 0n : 1n;
  body.innerHTML = rows.map((r) => {
    let out = "";
    if (state.codeActive) {
      out = r.error
        ? `<td class="out err-cell" title="${escapeAttr(r.error)}">!</td>`
        : `<td class="out">${renderValue(r.output || "")}</td>`;
    }
    return `<tr><td class="ix">${group((BigInt(r.index) + off).toString())}</td>` +
           `<td class="val">${renderValue(r.value)}</td>${out}</tr>`;
  }).join("");
  $("status").textContent = rows.length ? "" : (state.ok ? t("pastEnd") : "");
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
                  .replace(/</g, "&lt;");
}

async function loadRows() {
  if (!state.ok) { renderRows([]); return; }
  const r = await call("rows", { from: state.from.toString(), n: state.per });
  renderRows(r.rows || []);
  syncSlider();
  renderBookmarks();
}

// The bookmarks for the current example: whatever it ships plus whatever the
// user has added for it, each a named jump to an index.
function currentBookmarks() {
  const ex = allExamples().find((e) => e.id === state.selected);
  const built = (ex && ex.bookmarks) || [];
  const mfam = state.selected ? (marks[state.selected] || []) : [];
  return built.map((b) => ({
    name: typeof b.name === "string" ? b.name : (b.name[lang] || b.name.en),
    index: b.index, own: false
  })).concat(mfam.map((b) => ({ name: b.name, index: b.index, own: true })));
}

function renderBookmarks() {
  const box = $("bookmarks");
  const list = currentBookmarks();
  const canAdd = state.ok && !!state.selected;
  let html = list.map((b, i) =>
    `<span class="mark"><button class="markgo" data-i="${i}">` +
    `${escapeAttr(b.name)}</button>` +
    (b.own ? `<button class="markdel" data-i="${i}" title="${t("deleteOne")}">&times;</button>` : "") +
    `</span>`).join("");
  if (canAdd)
    html += `<button id="markadd" title="${t("addBookmark")}">&#9733; +</button>`;
  box.innerHTML = html;
  for (const b of box.querySelectorAll(".markgo"))
    b.onclick = () => { const bm = list[+b.dataset.i]; if (bm) jumpToIndex(bm.index); };
  for (const b of box.querySelectorAll(".markdel"))
    b.onclick = () => { deleteBookmark(list[+b.dataset.i]); };
  const add = $("markadd");
  if (add) add.onclick = openBookmarkBox;
}

// Move to an absolute (zero-based) index, wherever the reader currently is.
function jumpToIndex(index) {
  let v;
  try { v = BigInt(index); } catch { return; }
  setFrom(v < 0n ? 0n : v);
}

function deleteBookmark(bm) {
  if (!state.selected || !bm || !bm.own) return;
  marks[state.selected] = (marks[state.selected] || [])
    .filter((m) => !(m.name === bm.name && m.index === bm.index));
  localStorage.setItem(STORE_MARKS, JSON.stringify(marks));
  renderBookmarks();
}

function openBookmarkBox() {
  if (!state.selected) return;
  $("bmname").value = "";
  // The index shown is the one the reader is looking at, in their numbering.
  $("bmindex").textContent =
    group((state.from + (state.zeroBased ? 0n : 1n)).toString());
  $("bmbox").showModal();
}

function syncSlider() {
  if (state.slider !== "proportion" || !state.count || state.count === "0") return;
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

  $("pattern").oninput = () => {
    state.selected = null; renderNote(); renderLibrary(); renderBookmarks();
    scheduleReparse();
  };
  $("code").oninput = () => {
    state.selected = null; renderNote(); renderLibrary();
    clearTimeout(reparseTimer);
    reparseTimer = setTimeout(async () => { await applyCode(); loadRows(); }, 300);
  };
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
    if (state.slider === "length") {
      const L = Number($("slider").value);
      if (!lengthStarts[L]) { setFrom(0n); return; }
      $("sliderhint").textContent =
        `${t("sliderAt")} ${L} — ${t("indexCol")} ${group(lengthStarts[L])}`;
      setFrom(BigInt(lengthStarts[L]));
      return;
    }
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

  $("addown").onclick = () => openSaveBox(null);
  $("savebox").addEventListener("close", saveFromBox);

  // The two side views: the examples, and the helper reference for the code.
  for (const b of document.querySelectorAll("#sidetabs .stab")) b.onclick = () => {
    const side = b.dataset.side;
    for (const o of document.querySelectorAll("#sidetabs .stab"))
      o.classList.toggle("on", o === b);
    show($("examples-view"), side === "examples");
    show($("helpers-view"), side === "helpers");
  };

  $("bmbox").addEventListener("close", () => {
    if ($("bmbox").returnValue !== "save") return;
    const name = $("bmname").value.trim();
    if (!name || !state.selected) return;
    // Stored as a zero-based index, whatever numbering was on screen.
    const idx = (state.from).toString();
    (marks[state.selected] = marks[state.selected] || []).push({ name, index: idx });
    localStorage.setItem(STORE_MARKS, JSON.stringify(marks));
    renderBookmarks();
  });
}

// Opens the form for a new example, or for one of your own to be edited. An
// edit keeps the entry's identity so that saving replaces it rather than
// making a second copy of it.
let editing = null;

function openSaveBox(ex) {
  editing = ex && ex.own ? ex : null;
  $("savename").value = editing ? exampleName(editing)
                               : (allExamples().find((e) => e.id === state.selected)
                                    ? exampleName(allExamples().find((e) => e.id === state.selected))
                                    : "");
  $("savenote").value = editing ? exampleNote(editing) : "";
  if (editing) {
    $("pattern").value = (editing.flags ? "(?" + editing.flags + ")" : "") +
                         editing.pattern;
    $("code").value = editing.code || "";
    $("codepanel").open = !!editing.code;
  }
  $("savebox").showModal();
}

function saveFromBox() {
  if ($("savebox").returnValue !== "save") { editing = null; return; }
  const name = $("savename").value.trim();
  if (!name) { editing = null; return; }
  const entry = {
    id: editing ? editing.id : "own-" + Date.now(),
    pattern: $("pattern").value,
    flags: currentFlags(),
    name,
    note: $("savenote").value.trim(),
    code: $("code").value.trim(),
    infinite: state.infinite
  };
  const at = editing ? mine.findIndex((m) => m.id === editing.id) : -1;
  if (at >= 0) mine[at] = entry; else mine.push(entry);
  classified.set(entry.id, state.infinite);
  localStorage.setItem(STORE_MINE, JSON.stringify(mine));
  state.selected = entry.id;
  editing = null;
  state.filter = "mine";
  for (const o of document.querySelectorAll("#libtabs .tab"))
    o.classList.toggle("on", o.dataset.filter === "mine");
  renderLibrary();
  renderNote();
}

async function onReady() {
  renderHelpers();
  await classifyExamples();
  if ($("pattern").value) reparse();
  else selectExample(BUILTIN[0]);
}

transport.ready(() => { ready = true; onReady(); });

wire();
applyLanguage();
