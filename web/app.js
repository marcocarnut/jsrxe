import { LANGS, makeT, translateError, SCALES, DECSEP } from "./i18n.js";
import { BUILTIN } from "./patterns.js";
import { makeWorkerTransport } from "./transport.js";
import { HELPER_DOCS } from "./sandbox.js";
import { BUILTIN_DICTS } from "./dicts.js";

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
const STORE_DICTS = "jsrxe.dicts";

let lang = localStorage.getItem(STORE_LANG) ||
           (navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
if (!LANGS[lang]) lang = "en";
let t = makeT(lang);

let state = {
  ok: false, infinite: false, shortlex: false, count: null,
  from: 0n, per: 50, zeroBased: true, keyActive: false, filter: "all",
  selected: null, slider: "none", codeActive: false,
  note: "", orderTip: "", sliderTip: "", countSpoken: "", timeTip: ""
};

let mine = [];
try { mine = JSON.parse(localStorage.getItem(STORE_MINE) || "[]"); } catch { mine = []; }

// User-added bookmarks, keyed by example id, alongside whatever the example
// itself ships. Same shape as examples: built-in plus mine, and only mine can
// be removed.
let marks = {};
try { marks = JSON.parse(localStorage.getItem(STORE_MARKS) || "{}"); } catch { marks = {}; }

// The user's own dictionaries, kept in this browser. Built-in ones live in
// dicts.js; both are registered with the library the same way.
let myDicts = [];
try { myDicts = JSON.parse(localStorage.getItem(STORE_DICTS) || "[]"); } catch { myDicts = []; }

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

// A fixed-point number with the language's decimal mark, for exponents and
// mantissas -- Portuguese writes 10^2,4771, not 10^2.4771.
function dec(x, digits) {
  const s = x.toFixed(digits);
  return DECSEP[lang] === "," ? s.replace(".", ",") : s;
}

// Read a set's size the way a person would say it: "about 30 quinvigintillion".
// Works straight off the exact decimal string -- the number of digits gives the
// magnitude, the leading digits give the mantissa -- so it stays honest for
// sizes far past what a double could hold. Beyond the naming table it falls
// back to a digit count.
function spoken(s) {
  const d = s.length;
  const g = Math.floor((d - 1) / 3);        // how many three-digit groups
  if (g < 1) return "";                     // under a thousand; it speaks for itself
  const table = SCALES[lang] || SCALES.en;
  if (g >= table.length)
    return `${t("spokenDigitsPre")} ${group(String(d))} ${t("spokenDigitsPost")}`;

  const intLen = d - 3 * g;                  // 1..3 digits before the scale
  const head = s.slice(0, Math.min(d, intLen + 4));
  const mant = Number(head) / Math.pow(10, head.length - intLen);

  // Round the mantissa to something a person would actually say.
  const nice = mant >= 100 ? Math.round(mant / 10) * 10
             : mant >= 10  ? Math.round(mant)
             :               Math.round(mant * 10) / 10;

  // The exact integer we are about to say aloud, so we can tell whether the
  // real count lands on it, just under, or just over -- the spoken echo of the
  // "=" versus "~" on the numeric exponents. nice*10 is always whole (nice has
  // at most one decimal), so the scale keeps this exact for any size.
  const spokenValue = BigInt(Math.round(nice * 10)) * (10n ** BigInt(3 * g - 1));
  const actual = BigInt(s);
  const lead = actual === spokenValue ? t("spokenExactly")
             : actual <  spokenValue  ? t("spokenBitLess")
             :                          t("spokenBitMore");

  let word = table[g];
  // Portuguese pluralises the -ão scale words at two and above (1,5 milhão
  // stays singular); "mil" and English never change.
  if (lang === "pt" && nice >= 2 && word.endsWith("ão"))
    word = word.slice(0, -2) + "ões";

  const mantStr = Number.isInteger(nice) ? String(nice) : dec(nice, 1);
  return `${lead} ${mantStr} ${word}`;
}

// A non-negative integer (as a decimal string) named the way a person says it:
// "342", "13.8 billion", "5.4 duodecillion". Past the naming table it degrades
// to a power of ten. Returns whether the scale word is a "big" one -- milhão
// and up -- because Portuguese links those to a following noun with "de" and
// pluralises them, where "mil" and bare numbers do neither.
function scaledNumber(nStr) {
  const d = nStr.length;
  const g = Math.floor((d - 1) / 3);
  if (g < 1) return { str: group(nStr), big: false };      // under a thousand
  const table = SCALES[lang] || SCALES.en;
  if (g >= table.length) return { str: "10^" + (d - 1), big: false };
  const intLen = d - 3 * g;
  const head = nStr.slice(0, Math.min(d, intLen + 3));
  const mant = Number(head) / Math.pow(10, head.length - intLen);
  const nice = mant >= 100 ? Math.round(mant)
             : mant >= 10  ? Math.round(mant * 10) / 10
             :               Math.round(mant * 100) / 100;
  const mantStr = Number.isInteger(nice) ? String(nice) : dec(nice, nice >= 10 ? 1 : 2);
  let word = table[g];
  const big = g >= 2;                              // milhão and up
  if (lang === "pt" && big && nice >= 2 && word.endsWith("ão"))
    word = word.slice(0, -2) + "ões";             // milhão -> milhões
  return { str: `${mantStr} ${word}`, big };
}

// Join a scaled number to the noun it counts, with the Portuguese "de" that
// milhão and up require: "173 nonilhões de anos", but "173 mil anos" and
// "342 anos" and, in English, always a plain space.
function scaledPhrase(nStr, noun) {
  const { str, big } = scaledNumber(nStr);
  return str + (lang === "pt" && big ? " de " : " ") + noun;
}

// A small count with one optional decimal, in the language's decimal mark.
function num1(x) { return Number.isInteger(x) ? String(x) : dec(x, 1); }

// Time-unit names carry both forms as "singular|plural"; pick by the value so
// it never reads "1 segundos" or "1 days".
function unitName(key, value) {
  const [s, p] = t(key).split("|");
  return value === 1 ? s : p;
}

// How the speed slider reads: 10^e visits a second, said as "N per second",
// with the clean powers annotated by the time between visits.
function rateLabel(e) {
  const per = { 3: "millisecond", 6: "microsecond", 9: "nanosecond",
                12: "picosecond", 15: "femtosecond" };
  // "per second" is elliptical (one per second of visits), so no "de" here.
  let label = `${scaledNumber((10n ** BigInt(e)).toString()).str} ${t("perSecond")}`;
  if (per[e]) label += ` (${t("timeOnePer")} ${t("period_" + per[e])})`;
  return label;
}

// A duration in seconds (a BigInt, since a set can want more seconds than the
// universe has) named in the largest fitting unit -- seconds up through years,
// then centuries, millennia, and years by the magnitude scale beyond that.
function durationBig(seconds) {
  const YEAR = 31557600n;                          // 365.25 days
  const rungs = [
    ["timeSeconds", 1n, 60n], ["timeMinutes", 60n, 3600n],
    ["timeHours", 3600n, 86400n], ["timeDays", 86400n, 2629800n],
    ["timeMonths", 2629800n, YEAR]
  ];
  const say = (key, unit) => {
    const v = Number(seconds * 10n / unit) / 10;
    return `${num1(v)} ${unitName(key, v)}`;
  };
  for (const [key, unit, next] of rungs) if (seconds < next) return say(key, unit);
  const years = seconds / YEAR;
  if (years < 100n)     return say("timeYears", YEAR);
  const sayY = (key, per) => {
    const v = Number(years * 10n / per) / 10;
    return `${num1(v)} ${unitName(key, v)}`;
  };
  if (years < 1000n)    return sayY("timeCenturies", 100n);
  if (years < 1000000n) return sayY("timeMillennia", 1000n);
  // Beyond a million years the noun always follows "de" in Portuguese, so it is
  // plural regardless -- "1 milhão de anos".
  return scaledPhrase(years.toString(), t("timeYears").split("|")[1]);
}

// The spoken simplification: how the span compares to spans a person has a feel
// for. Empty in the middle range, where the big number already speaks.
function durationTip(seconds) {
  const YEAR = 31557600n;
  const years = seconds / YEAR;
  const UNIVERSE = 13790000000n, EARTH = 4543000000n, HISTORY = 5000n;
  if (years >= UNIVERSE) return "≈ " + scaledPhrase((years / UNIVERSE).toString(), t("timeUniverse"));
  if (years >= EARTH)    return "≈ " + scaledPhrase((years / EARTH).toString(), t("timeEarth"));
  if (years >= HISTORY)  return "≈ " + scaledPhrase((years / HISTORY).toString(), t("timeHistory"));
  return "";
}

// Fill the "time to visit them all" panel for the current set and speed.
function renderTime() {
  if ($("timebox").hidden) return;
  const e = Number($("timespeed").value);
  $("timerate").textContent = rateLabel(e);
  const big = $("timebig");
  if (!state.ok) { big.textContent = ""; state.timeTip = ""; return; }
  if (state.infinite) {
    big.textContent = t("timeForever"); state.timeTip = t("timeForeverTip"); return;
  }
  if (!state.count) { big.textContent = ""; state.timeTip = ""; return; }
  const count = BigInt(state.count), rate = 10n ** BigInt(e);
  if (count < rate) {
    big.textContent = t("timeInstant"); state.timeTip = t("timeInstantTip"); return;
  }
  const seconds = count / rate;
  big.textContent = durationBig(seconds);
  state.timeTip = durationTip(seconds);
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

// The per-element code lives behind the </> button next to the regex. Showing
// it is one thing; whether it holds anything is another, and the button is
// highlighted for the latter so a folded-away code section still announces
// itself.
function setCodeVisible(on) {
  show($("codewrap"), on);
  $("codetoggle").classList.toggle("open", on);
}
function refreshCodeToggle() {
  $("codetoggle").classList.toggle("filled", !!$("code").value.trim());
}

// One floating tooltip, positioned over whichever element the pointer is on.
// The text comes from a getter so it tracks the current example and language
// rather than being fixed when the handler was attached; an empty string
// means there is nothing to say and nothing is shown.
function attachTip(el, getter) {
  const tip = $("tooltip");
  const place = () => {
    const text = getter();
    if (!text) { tip.hidden = true; return; }
    tip.textContent = text;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const top = r.bottom + window.scrollY + 6;
    tip.style.top = top + "px";
    // Keep it on screen: clamp the left edge to the viewport.
    const w = Math.min(tip.offsetWidth, window.innerWidth - 16);
    let left = r.left + window.scrollX;
    if (left + w > window.scrollX + window.innerWidth - 8)
      left = window.scrollX + window.innerWidth - 8 - w;
    tip.style.left = Math.max(8, left) + "px";
  };
  el.addEventListener("mouseenter", place);
  el.addEventListener("mouseleave", () => { tip.hidden = true; });
}

// A member arrives as a byte string, one character per byte, because the
// library counts and seeks in bytes and knows nothing of Unicode. When those
// bytes happen to be valid UTF-8 -- as an accented Portuguese literal is --
// decode them so the text reads correctly; a genuinely binary member is not
// valid UTF-8 and keeps its raw bytes. Nothing here changes what the library
// enumerates, only how the same bytes are shown.
function decodeMember(s) {
  let hi = false;
  for (let i = 0; i < s.length; i++)
    if (s.charCodeAt(i) > 127) { hi = true; break; }
  if (!hi) return s;                       // pure ASCII, nothing to decode
  try {
    return new TextDecoder("utf-8", { fatal: true })
             .decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
  } catch {
    return s;                              // not UTF-8: show the raw bytes
  }
}

// Members can hold any byte, including control characters. Render those
// visibly rather than letting them disappear into the markup.
function renderValue(s) {
  if (s === "") return `<span class="dim">${t("emptyString")}</span>`;
  let out = "";
  for (const ch of decodeMember(s)) {
    const c = ch.codePointAt(0);
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
  for (const el of document.querySelectorAll("[data-ttip]"))
    el.title = t(el.dataset.ttip);
  $("code").placeholder = t("codePlace");
  $("codetoggle").title = t("codeToggle");
  renderLibrary();
  renderHelpers();
  renderDicts();
  renderBookmarks();
  renderNote();
  renderCount();
  renderOrder();
  renderRows(lastRows);
  // A selected example whose regex has a language variant follows the language:
  // swap the pattern text and re-read from the top.
  const sel = state.selected &&
              allExamples().find((e) => e.id === state.selected);
  if (sel && typeof sel.pattern !== "string") {
    const inline = sel.flags ? "(?" + sel.flags + ")" : "";
    $("pattern").value = inline + examplePattern(sel);
    $("from").value = "0"; state.from = 0n;
    reparse();
  }
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

// The regex itself can have language variants, like the note: an example whose
// members are English words reads wrong in Portuguese, so it carries a
// translated pattern. The library stays byte-based -- these are accented
// literals, which it handles as byte sequences -- and only the display decodes
// them (see decodeMember).
function examplePattern(ex) {
  return typeof ex.pattern === "string" ? ex.pattern
                                        : (ex.pattern[lang] || ex.pattern.en);
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

// Which examples a category filter shows. Single-select, so the categories can
// overlap freely -- a highlight may also be finite and carry code; each filter
// is just an independent view of the one library.
function matchesFilter(ex) {
  switch (state.filter) {
    case "tutorial":   return !!ex.tutorial;
    case "highlights": return !!ex.highlight;
    case "code":       return !!(ex.code && ex.code.trim());
    case "finite":     return !looksInfinite(ex);
    case "infinite":   return looksInfinite(ex);
    case "mine":       return !!ex.own;
    default:           return true;              // "all"
  }
}

// Make a category the active filter, moving the highlight to its icon.
function setFilter(f) {
  state.filter = f;
  for (const b of document.querySelectorAll("#libtabs .subtab"))
    b.classList.toggle("on", b.dataset.filter === f);
  renderLibrary();
}

async function classifyExamples() {
  const list = allExamples().filter((e) => !classified.has(e.id));
  if (!list.length) return;
  const r = await call("classify",
                       { patterns: list.map((e) => ({ id: e.id, pattern: examplePattern(e) })) });
  for (const c of r.classified || []) classified.set(c.id, c.infinite);
  renderLibrary();
}

function renderLibrary() {
  const q = $("libsearch").value.trim().toLowerCase();
  const list = $("liblist");
  list.innerHTML = "";
  let lastFamily = null;
  for (const ex of allExamples()) {
    if (!matchesFilter(ex)) continue;
    const name = exampleName(ex);
    const family = exampleFamily(ex);
    if (q && !name.toLowerCase().includes(q) &&
        !(family || "").toLowerCase().includes(q) &&
        !examplePattern(ex).toLowerCase().includes(q)) continue;

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
      `<button class="pick"><span class="nmrow">` +
      `<span class="nm"></span><span class="badges"></span></span>` +
      `<code></code></button>` +
      (ex.own
        ? `<button class="edt" title="${t("editOne")}">&#9998;</button>` +
          `<button class="del" title="${t("deleteOne")}">&times;</button>`
        : "");
    li.querySelector(".nm").textContent = name;
    li.querySelector("code").textContent = examplePattern(ex);
    // Marks to the right of the name, so the list says what the title would
    // otherwise have to: infinite sets, and examples that carry code.
    const badges = li.querySelector(".badges");
    if (looksInfinite(ex))
      badges.insertAdjacentHTML("beforeend",
        `<span class="badge" title="${t("badgeInfinite")}">∞</span>`);
    if (ex.code && ex.code.trim())
      badges.insertAdjacentHTML("beforeend",
        `<span class="badge" title="${t("badgeCode")}">&lt;/&gt;</span>`);
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

/* -------------------------------------------------------- dictionaries */

function allDicts() {
  return BUILTIN_DICTS.map((d) => ({ ...d, builtin: true }))
    .concat(myDicts.map((d) => ({ ...d, builtin: false })));
}

function dictName(d) {
  if (!d.name) return d.id;
  return typeof d.name === "string" ? d.name : (d.name[lang] || d.name.en);
}

function dictNote(d) {
  if (!d.note) return "";
  return typeof d.note === "string" ? d.note : (d.note[lang] || d.note.en);
}

// Register every dictionary with the library, so [:name:] resolves. Called at
// startup and whenever the user's set changes; freeDicts first, so a removed
// one stops resolving. The words leave here as an array; the engine joins
// them for the boundary.
async function registerAllDicts() {
  await call("freeDicts");
  for (const d of allDicts())
    await call("registerDict", { name: d.id, words: d.words });
}

function renderDicts() {
  const list = $("dictlist");
  list.innerHTML = "";
  for (const d of allDicts()) {
    const li = document.createElement("li");
    const tag = d.builtin ? `<span class="tag">${t("dictBuiltin")}</span>` : "";
    li.innerHTML =
      `<div class="dhead"><code>[:${d.id}:]</code>${tag}` +
      (d.builtin ? "" : `<button class="del" title="${t("deleteOne")}">&times;</button>`) +
      `</div><div class="dname"></div>` +
      `<div class="dmeta">${d.words.length} ${t("dictWordsCount")}</div>` +
      `<button class="duse">${t("dictUse")}</button>`;
    li.querySelector(".dname").textContent = dictName(d);
    const note = dictNote(d);
    if (note) li.querySelector(".dname").title = note;
    li.querySelector(".duse").onclick = () => {
      // Drop [:id:] into the pattern at the cursor, or append it.
      const p = $("pattern");
      const ins = `[:${d.id}:]`;
      const at = p.selectionStart ?? p.value.length;
      p.value = p.value.slice(0, at) + ins + p.value.slice(p.selectionEnd ?? at);
      state.selected = null; renderNote(); renderLibrary(); scheduleReparse();
    };
    if (!d.builtin) li.querySelector(".del").onclick = async () => {
      if (!confirm(t("deleteConfirm"))) return;
      myDicts = myDicts.filter((m) => m.id !== d.id);
      localStorage.setItem(STORE_DICTS, JSON.stringify(myDicts));
      await registerAllDicts();
      renderDicts();
      reparse();
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
  $("pattern").value = inline + examplePattern(ex);
  $("from").value = "0";
  $("key").value = "";
  $("code").value = ex.code || "";
  setCodeVisible(!!ex.code);
  refreshCodeToggle();
  state.from = 0n;
  renderLibrary();
  renderNote();
  reparse();
}

// The note is a tooltip over the regex field now, so this only records the
// text; attachTip reads it on hover.
function renderNote() {
  const ex = allExamples().find((e) => e.id === state.selected);
  state.note = ex ? exampleNote(ex) : "";
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
    state.sliderTip = t("sliderHintFinite");
    show($("coarse"), true);
    syncSlider();
  } else if (state.ok && state.infinite) {
    state.slider = "length";
    $("slider").max = String(Math.max(1, lengthStarts.length - 1));
    $("slider").value = "0";
    state.sliderTip = t("sliderHintLength");
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
  show($("timebtn"), state.ok);
  renderTime();
  if (!state.ok) { el.textContent = ""; ap.textContent = ""; state.countSpoken = ""; return; }
  if (state.infinite) {
    el.textContent = t("sizeInfinite");
    ap.textContent = "";
    state.countSpoken = t("infiniteTip");
    return;
  }
  if (state.count === "0") {
    el.textContent = t("sizeEmpty"); ap.textContent = ""; state.countSpoken = ""; return;
  }
  el.textContent = group(state.count);
  const { log10, log2 } = logs(state.count);
  const p10 = isExactPower(state.count, 10) ? "=" : "~";
  const p2 = isExactPower(state.count, 2) ? "=" : "~";
  ap.textContent = `${p10} 10^${dec(log10, 4)}   ${p2} 2^${dec(log2, 4)}`;
  state.countSpoken = spoken(state.count);
}

function renderOrder() {
  const el = $("orderlabel");
  if (!state.ok) { el.textContent = ""; state.orderTip = ""; return; }
  if (state.shortlex) { el.textContent = "(" + t("orderShortlex") + ")"; state.orderTip = t("orderShortlexHint"); }
  else if (state.infinite) { el.textContent = "(" + t("orderDiagonal") + ")"; state.orderTip = t("orderDiagonalHint"); }
  else { el.textContent = "(" + t("orderPlace") + ")"; state.orderTip = t("orderPlaceHint"); }
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
    index: b.index, key: b.key || "", own: false
  })).concat(mfam.map((b) =>
    ({ name: b.name, index: b.index, key: b.key || "", own: true })));
}

function renderBookmarks() {
  const box = $("bookmarks");
  const list = currentBookmarks();
  const canAdd = state.ok && !!state.selected;
  let html = list.map((b, i) =>
    `<span class="mark ${b.key ? "keyed" : ""}"><button class="markgo" data-i="${i}"` +
    (b.key ? ` title="${escapeAttr(t("bmWith") + " " + b.key)}"` : "") +
    `>${escapeAttr(b.name)}</button>` +
    (b.own ? `<button class="markdel" data-i="${i}" title="${t("deleteOne")}">&times;</button>` : "") +
    `</span>`).join("");
  if (canAdd)
    html += `<button id="markadd" title="${t("addBookmark")}">&#9733; +</button>`;
  box.innerHTML = html;
  for (const b of box.querySelectorAll(".markgo"))
    b.onclick = () => { const bm = list[+b.dataset.i]; if (bm) applyBookmark(bm); };
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

// A bookmark is a position in an ordering, and the ordering is the shuffle key,
// so applying one sets the key first and then jumps. With no key it lands in
// plain index order -- the way back from any shuffle.
async function applyBookmark(bm) {
  const want = bm.key || "";
  if ($("key").value !== want) {
    $("key").value = want;
    await applyKey();
  }
  jumpToIndex(bm.index);
}

function deleteBookmark(bm) {
  if (!state.selected || !bm || !bm.own) return;
  marks[state.selected] = (marks[state.selected] || [])
    .filter((m) => !(m.name === bm.name && m.index === bm.index &&
                     (m.key || "") === (bm.key || "")));
  localStorage.setItem(STORE_MARKS, JSON.stringify(marks));
  renderBookmarks();
}

function openBookmarkBox() {
  if (!state.selected) return;
  $("bmname").value = "";
  // The index shown is the one the reader is looking at, in their numbering.
  $("bmindex").textContent =
    group((state.from + (state.zeroBased ? 0n : 1n)).toString());
  // A bookmark remembers the shuffle key in force, so show which one it keeps.
  const key = $("key").value.trim();
  show($("bmkeyline"), !!key);
  $("bmkey").textContent = key;
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
    state.selected = null; renderNote(); renderLibrary(); refreshCodeToggle();
    clearTimeout(reparseTimer);
    reparseTimer = setTimeout(async () => { await applyCode(); loadRows(); }, 300);
  };
  // The </> button folds the code section in and out; a fresh open lands the
  // cursor in it so the reader can start typing at once.
  $("codetoggle").onclick = () => {
    const on = $("codewrap").hidden;
    setCodeVisible(on);
    if (on) $("code").focus();
  };
  $("key").oninput = () => { clearTimeout(reparseTimer); reparseTimer = setTimeout(async () => { await applyKey(); loadRows(); }, 250); };

  // The time-to-visit-them-all reveal, folded into the size box.
  $("timebtn").onclick = () => {
    const on = $("timebox").hidden;
    show($("timebox"), on);
    $("timebtn").classList.toggle("on", on);
    if (on) renderTime();
  };
  $("timespeed").oninput = renderTime;

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
      state.sliderTip =
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
  // Fine by default -- one element per notch, to pinpoint -- with a middle gear
  // of ten when Ctrl or the middle button is held down while rolling. Coarse
  // movement is the slider's job.
  $("results").onwheel = (e) => {
    if (!state.ok) return;
    e.preventDefault();
    const fast = e.ctrlKey || (e.buttons & 4);
    const step = BigInt(fast ? 10 : 1);
    setFrom(e.deltaY > 0 ? state.from + step : state.from - step);
  };

  $("libsearch").oninput = renderLibrary;
  for (const b of document.querySelectorAll("#libtabs .subtab"))
    b.onclick = () => setFilter(b.dataset.filter);

  // The on-ramp: newcomers land on the first tutorial step, veterans on the
  // first highlight -- each also switching the filter so the neighbours show.
  $("ob-new").onclick = (e) => {
    e.preventDefault();
    setFilter("tutorial");
    const ex = allExamples().find((x) => x.tutorial);
    if (ex) selectExample(ex);
  };
  $("ob-best").onclick = (e) => {
    e.preventDefault();
    setFilter("highlights");
    const ex = allExamples().find((x) => x.highlight);
    if (ex) selectExample(ex);
  };

  $("addown").onclick = () => openSaveBox(null);
  $("savebox").addEventListener("close", saveFromBox);

  // The global tabs switch the left pane between the examples, the helper
  // reference and the dictionaries.
  for (const b of document.querySelectorAll("#tabs .tab")) b.onclick = () => {
    const side = b.dataset.side;
    for (const o of document.querySelectorAll("#tabs .tab"))
      o.classList.toggle("on", o === b);
    show($("examples-view"), side === "examples");
    show($("helpers-view"), side === "helpers");
    show($("dicts-view"), side === "dicts");
  };

  $("adddict").onclick = () => {
    $("dictname").value = "";
    $("dictwords").value = "";
    $("dictfile").value = "";
    $("dictbox").showModal();
  };
  // Loading a file just fills the textarea; the words are read from there.
  $("dictfile").onchange = () => {
    const f = $("dictfile").files[0];
    if (!f) return;
    if (!$("dictname").value) $("dictname").value =
      f.name.replace(/\.(txt|dict)$/i, "").replace(/[^A-Za-z0-9_]/g, "");
    const reader = new FileReader();
    reader.onload = () => { $("dictwords").value = reader.result; };
    reader.readAsText(f);
  };
  $("dictbox").addEventListener("close", saveDictFromBox);

  $("bmbox").addEventListener("close", () => {
    if ($("bmbox").returnValue !== "save") return;
    const name = $("bmname").value.trim();
    if (!name || !state.selected) return;
    // Stored as a zero-based index, whatever numbering was on screen, together
    // with the shuffle key it belongs to so the same element comes back.
    const idx = (state.from).toString();
    const bkey = $("key").value.trim();
    (marks[state.selected] = marks[state.selected] || [])
      .push({ name, index: idx, key: bkey });
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
    setCodeVisible(!!editing.code);
    refreshCodeToggle();
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
  setFilter("mine");
  renderNote();
}

async function onReady() {
  renderHelpers();
  await classifyExamples();
  if ($("pattern").value) reparse();
  else selectExample(BUILTIN[0]);
}

function saveDictFromBox() {
  if ($("dictbox").returnValue !== "save") return;
  const name = $("dictname").value.trim().replace(/[^A-Za-z0-9_]/g, "");
  const words = $("dictwords").value.split(/\r?\n/)
    .map((w) => w.trim()).filter(Boolean);
  if (!name || !words.length) return;
  const at = myDicts.findIndex((d) => d.id === name);
  const entry = { id: name, name, words };
  if (at >= 0) myDicts[at] = entry; else myDicts.push(entry);
  localStorage.setItem(STORE_DICTS, JSON.stringify(myDicts));
  registerAllDicts().then(() => { renderDicts(); reparse(); });
}

transport.ready(async () => {
  await registerAllDicts();
  ready = true;
  onReady();
});

wire();
attachTip($("pattern"), () => state.note);
attachTip($("count"), () => state.countSpoken);
attachTip($("timebig"), () => state.timeTip);
attachTip($("orderlabel"), () => state.orderTip);
attachTip($("slider"), () => state.sliderTip);
applyLanguage();
