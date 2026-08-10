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

// A parse error, with the pattern echoed beneath and a caret at the offending
// character. Byte offset equals character index for the ASCII a pattern almost
// always is; a stray multibyte literal would nudge the caret, never break it.
function showParseError(msg, pattern, pos) {
  const p = Math.max(0, Math.min(pos | 0, pattern.length));
  const caret = " ".repeat(p) + "^";
  $("err").innerHTML =
    `<span>${escapeAttr(msg)}</span>` +
    `<pre class="errcaret">${escapeAttr(pattern)}\n${caret}</pre>`;
  show($("err"), true);
}

/* ------------------------------------------------------------------- state */

const $ = (id) => document.getElementById(id);
const STORE_LANG = "jsrxe.lang";
const STORE_MINE = "jsrxe.examples";
const STORE_MARKS = "jsrxe.bookmarks";
const STORE_DICTS = "jsrxe.dicts";
const STORE_ORIENT = "jsrxe.orient";

// A member is trimmed on the page past this many bytes -- the DOM is happy
// with a few kilobytes a row, not megabytes. The library could show far more;
// this is the page being kind to the browser. ?maxlen= in the URL lifts it,
// for anyone who means it, up to a ceiling that still cannot wedge the tab.
const DEFAULT_MAX_MEMBER = 4096;
const MAX_MEMBER_CEILING = 8 * 1024 * 1024;
function readMaxMember() {
  const raw = new URLSearchParams(location.search).get("maxlen");
  if (raw === null) return DEFAULT_MAX_MEMBER;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_MEMBER;
  return Math.min(n, MAX_MEMBER_CEILING);
}

// Language, in priority order: a ".pt-br." (or ".en.") tag in the page's file
// name, so a translated copy can be shared by its URL and open in the right
// language; then a choice saved from the selector; then the browser; then
// English. The parentheses around the ternary matter -- without them it bound
// to the whole || chain, so any stored value at all read as Portuguese.
function urlLang() {
  const p = (location.pathname || "").toLowerCase();
  if (p.includes(".pt-br.") || p.includes(".pt.")) return "pt";
  if (p.includes(".en.")) return "en";
  return null;
}
let lang = urlLang() ||
           localStorage.getItem(STORE_LANG) ||
           ((navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en");
if (!LANGS[lang]) lang = "en";
let t = makeT(lang);

let state = {
  ok: false, infinite: false, shortlex: false, count: null,
  from: 0n, per: 50, zeroBased: true, key: "", keyActive: false, filter: "all",
  selected: null, slider: "none", codeActive: false, tab: "elements",
  note: "", orderTip: "", sliderTip: "", countSpoken: "", timeTip: "",
  maxMember: readMaxMember()
};

// The last search's result, kept so switching away from the Search tab and
// back does not lose it. Null until a search is run; cleared when the
// expression or key changes, since the indices would no longer mean anything.
let lastSearch = null;

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
// A member is a byte string and may carry UTF-8 to decode; the code section's
// output is already a JS string -- possibly real Unicode, like ♠♥♦♣ from a
// transform -- and must not go through the byte decoder, or its code points get
// truncated to bytes. Callers rendering an output pass asText.
function renderValue(s, asText) {
  if (s === "") return `<span class="dim">${t("emptyString")}</span>`;
  let out = "";
  for (const ch of (asText ? s : decodeMember(s))) {
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

// Switch language and re-render everything in it. Kept separate from the
// selector's handler so a shared example link can pin its language too.
function setLang(l) {
  if (!LANGS[l]) return;
  lang = l;
  localStorage.setItem(STORE_LANG, lang);
  $("lang").value = lang;
  applyLanguage();
}

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
  setShareLabel();
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

// Retire the landscape nudge for good: the reader has committed to using the
// page as it is.
function dismissOrient() {
  $("orient").classList.add("dismissed");
  localStorage.setItem(STORE_ORIENT, "off");
}

// Unfold the library. On a wide screen it is never folded, so this is a no-op
// there; on a small one it is what makes "start here" visibly do something.
function expandLibrary() {
  $("left").classList.remove("lib-collapsed");
  $("libtoggle").setAttribute("aria-expanded", "true");
}

// On a small screen, picking an example folds the library away and brings the
// workbench into view, so the result is what you are looking at. A no-op on
// wide screens, where both panes are on screen at once.
function collapseOnMobile() {
  if (!window.matchMedia("(max-width: 900px)").matches) return;
  dismissOrient();                       // tapping an example counts as committing
  $("left").classList.add("lib-collapsed");
  $("libtoggle").setAttribute("aria-expanded", "false");
  $("work").scrollIntoView({ behavior: "smooth", block: "start" });
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
    li.querySelector(".pick").onclick = () => { selectExample(ex); collapseOnMobile(); };
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
  state.key = "";
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
let searchTimer = null;
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
    showParseError(t("parseError") + ": " + translateError(r.error, lang),
                   pattern, r.errorPos);
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
  // The set (or its order) just changed, so any prior search no longer means
  // anything; drop it and render whichever tab is showing -- re-running the
  // search when the Search tab holds a query, so a shared link resolves it.
  lastSearch = null;
  // A lit member belongs to the set that was showing; the set just changed, so
  // drop it rather than seek a now-meaningless index into the new one.
  treePath = ""; $("treeidx").value = "";
  if (state.tab === "search") {
    if ($("findtext").value) runSearch(); else renderSearch();
  } else if (state.tab === "tree") renderTree();
  else loadRows();
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
  const key = (state.key || "").trim();
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
let lastOverflow = false;

// The playful nudge shown when a page came back trimmed. {n} is the current
// cap, grouped, and {url} names the knob that lifts it.
function tooBigMessage() {
  return t("tooBig")
    .replace("{n}", group(String(state.maxMember)))
    .replace("{url}", "?maxlen=");
}

function renderRows(rows, overflow = lastOverflow) {
  lastRows = rows;
  lastOverflow = overflow;
  const body = $("results").querySelector("tbody");
  const off = state.zeroBased ? 0n : 1n;
  body.innerHTML = rows.map((r) => {
    let out = "";
    if (state.codeActive) {
      out = r.error
        ? `<td class="out err-cell" title="${escapeAttr(r.error)}">!</td>`
        : `<td class="out">${renderValue(r.output || "", true)}</td>`;
    }
    return `<tr><td class="ix">${group((BigInt(r.index) + off).toString())}</td>` +
           `<td class="val">${renderValue(r.value)}</td>${out}</tr>`;
  }).join("");
  // The nudge lives up by the input, not here, so the set's size cannot scroll
  // it off screen; this line keeps only its plain past-the-end note -- and not
  // even that when the page is empty because members were held back, not because
  // the index ran off the end.
  // The past-the-end note belongs to enumeration only; on the Search tab an
  // empty table means "not a member", which the search status says instead.
  $("status").textContent =
    (rows.length || overflow || state.tab !== "elements")
      ? "" : (state.ok ? t("pastEnd") : "");
  const tb = $("toobig");
  tb.textContent = overflow ? tooBigMessage() : "";
  tb.hidden = !overflow;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
                  .replace(/</g, "&lt;");
}

async function loadRows() {
  if (!state.ok) { renderRows([], false); return; }
  const r = await call("rows", { from: state.from.toString(), n: state.per });
  renderRows(r.rows || [], !!r.overflow);
  syncSlider();
  renderBookmarks();
}

// Re-render whichever tab owns the shared table. Used when something that
// affects both -- the code column, the shuffle key -- changes: the Search tab
// re-runs so its rows and count reflect the change, the Elements tab reloads.
function refreshTable() {
  if (state.tab === "search") { if (lastSearch) runSearch(); else renderSearch(); }
  else if (state.tab === "tree") { /* the tree's shape is independent of the
                                     code column and shuffle key; leave it. */ }
  else loadRows();
}

/* --------------------------------------------------------------- searching */

// Switch between enumerating (Elements) and searching (Search). They share the
// results table, so switching just swaps which controls show and re-renders it.
function setTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll(".etab"))
    b.classList.toggle("on", b.dataset.etab === tab);
  show($("elements-view"), tab === "elements");
  show($("search-view"), tab === "search");
  show($("tree-view"), tab === "tree");
  // The Tree tab wants the whole panel, so it hides the shared results table
  // and its status line rather than sitting above them.
  show($("results"), tab !== "tree");
  show($("status"), tab !== "tree");
  if (tab === "elements") loadRows();
  else if (tab === "search") { renderSearch(); $("findtext").focus(); }
  else renderTree();
}

// The numbering toggle appears in both tabs' controls; both reflect the one
// state, and flipping either re-renders the visible table under the new offset.
function syncZero() {
  for (const b of document.querySelectorAll(".zerotgl")) {
    b.classList.toggle("on", state.zeroBased);
    b.setAttribute("aria-pressed", String(state.zeroBased));
  }
}
function toggleZero() {
  state.zeroBased = !state.zeroBased;
  syncZero();
  $("from").value = (state.from + (state.zeroBased ? 0n : 1n)).toString();
  renderRows(lastRows);
}

// Run the search now: rank the string and show every index it sits at, capped.
async function runSearch() {
  if (!state.ok) { lastSearch = null; renderSearch(); return; }
  const text = $("findtext").value;
  const cap = Math.max(1, Math.min(1000, parseInt($("findcap").value, 10) || 50));
  lastSearch = await call("search", { text, cap });
  renderSearch();
}

// Turn the library's refusal reason into the page's own words.
function searchReason(reason) {
  if (/variable-length/.test(reason || "")) return t("searchReasonVar");
  if (/diagonal/.test(reason || "")) return t("searchReasonDiag");
  return t("searchReasonGen");
}

// Show the search result: the matching rows in the shared table, and a line
// saying how many there are -- a count above one being a duplicate, and a
// capped listing saying so.
function renderSearch() {
  const ss = $("searchstatus");
  ss.classList.remove("warn");
  if (!lastSearch) { renderRows([], false); ss.textContent = ""; return; }
  if (lastSearch.refused) {
    renderRows([], false);
    ss.classList.add("warn");
    ss.textContent = t("searchRefused") + " " + searchReason(lastSearch.reason);
    return;
  }
  renderRows(lastSearch.rows || [], false);
  const count = lastSearch.count || "0";
  if (count === "0") { ss.textContent = t("searchNotMember"); return; }
  const n = BigInt(count);
  let msg = n === 1n ? t("searchOne")
                     : group(count) + " " + t("searchCopies");
  if (BigInt(lastSearch.shown || 0) < n)
    msg += " · " + t("searchShowing") + " " + lastSearch.shown;
  ss.textContent = msg;
}

/* --------------------------------------------------------------- tree view */

// The parse tree, drawn with Cytoscape. The library's one traversal (the same
// rxedot prints DOT from) hands over a { nodes, edges } graph; this turns it
// into a picture that folds, pans and zooms -- everything a static SVG cannot.

// Cytoscape and dagre are ~700 KB, and most visits never open the Tree tab, so
// they load only when it is first shown. The single-file bundle inlines them
// (window.cytoscape is already defined, so this resolves at once); the served
// build injects the three vendor scripts in order the first time.
let cytoscapeReady = null;
let cyRegistered = false;
function ensureCytoscape() {
  if (cytoscapeReady) return cytoscapeReady;
  cytoscapeReady = new Promise((resolve, reject) => {
    if (window.cytoscape && window.cytoscapeDagre) { resolve(); return; }
    const srcs = ["vendor/cytoscape.min.js", "vendor/dagre.min.js",
                  "vendor/cytoscape-dagre.js"];
    (function next(i) {
      if (i >= srcs.length) { resolve(); return; }
      const s = document.createElement("script");
      s.src = srcs[i];
      s.onload = () => next(i + 1);
      s.onerror = () => reject(new Error("failed to load " + srcs[i]));
      document.head.appendChild(s);
    })(0);
  }).then(() => {
    if (window.cytoscape && window.cytoscapeDagre && !cyRegistered) {
      window.cytoscape.use(window.cytoscapeDagre);
      cyRegistered = true;
    }
  });
  return cytoscapeReady;
}

let cy = null;             // the Cytoscape instance, or null when none is drawn
let treeDir = "TB";        // dagre rank direction, toggled by Rotate
let treePath = "";         // the index whose route is lit, or "" for none

// rxedot's palette, by node kind, so the tree reads the same as the DOT drawing.
const TREE_FILL = {
  root:"#333a44", leaf:"#ffffff", literal:"#ffffff", group:"#eeeeee",
  alt:"#fff0c0", repeat:"#d4e4ff", comb:"#ffd4e6", shuffle:"#e6d4ff",
  dict:"#d4f4d4", subroutine:"#ffe0b0", backref:"#ffe0b0"
};
const TREE_HL = "#d1442a";   // the lit-path colour, rxedot's -f

function treeLabel(n) {
  if (n.kind === "alt") return "alternation";
  let s = n.line1 + (n.card ? "\n" + n.card : "");
  if (n.place) s += "\n" + n.place;
  if (n.choices) s += "\n" + n.choices;
  return s;
}

function buildTreeElements(g) {
  const els = [];
  for (const n of g.nodes) {
    const label = treeLabel(n);
    els.push({ data: { id: "n" + n.id, label, baseLabel: label, kind: n.kind,
                       inf: !!n.inf, onPath: !!n.onPath } });
  }
  for (const e of g.edges) {
    const branch = e.fromPort >= 0 && e.label;
    els.push({ data: {
      id: `e${e.from}_${e.fromPort}_${e.to}`,
      source: "n" + e.from, target: "n" + e.to,
      kind: e.isRef ? "ref" : "seq",
      label: branch ? e.label.replace(/\n/g, " ") : "",
      onPath: !!e.onPath } });
  }
  return els;
}

function treeStyle() {
  return [
    { selector: "node", style: {
        "label": "data(label)", "text-wrap": "wrap", "text-valign": "center",
        "text-halign": "center", "text-justification": "center",
        "font-family": "ui-monospace, Menlo, monospace", "font-size": "12px",
        "shape": "round-rectangle", "width": "label", "height": "label",
        "padding": "9px", "line-height": 1.25,
        "background-color": (n) => TREE_FILL[n.data("kind")] || "#ffffff",
        "border-width": 1, "border-color": "#cdc6b8", "color": "#2a2723" } },
    { selector: 'node[kind="root"]', style: { "color": "#ffffff", "border-color": "#333a44" } },
    { selector: 'node[kind="subroutine"], node[kind="backref"]', style: {
        "border-style": "dashed", "border-color": "#a8641e", "border-width": 2 } },
    { selector: "node[?inf]", style: { "border-color": "#2f60c0", "border-width": 2 } },
    { selector: "node.collapsed", style: { "border-style": "double", "border-width": 3 } },
    { selector: "node[?onPath]", style: { "border-color": TREE_HL, "border-width": 3 } },
    { selector: "edge", style: {
        "width": 1.4, "line-color": "#b8b0a2", "curve-style": "bezier",
        "target-arrow-shape": "triangle", "target-arrow-color": "#b8b0a2",
        "arrow-scale": 0.85, "label": "data(label)", "font-size": "10px",
        "color": "#8a8377", "font-family": "ui-monospace, Menlo, monospace",
        "text-rotation": "autorotate", "text-background-color": "#ffffff",
        "text-background-opacity": 0.7, "text-background-padding": "1px" } },
    { selector: 'edge[kind="ref"]', style: {
        "line-style": "dashed", "line-color": "#a8641e", "target-arrow-color": "#a8641e",
        "curve-style": "unbundled-bezier", "control-point-distances": [40],
        "control-point-weights": [0.5] } },
    { selector: "edge[?onPath]", style: {
        "line-color": TREE_HL, "target-arrow-color": TREE_HL, "width": 2.4 } }
  ];
}

function dagreLayout() {
  return { name: "dagre", rankDir: treeDir, nodeSep: 26, rankSep: 44,
           edgeSep: 10, fit: true, padding: 22 };
}

function destroyTree() { if (cy) { cy.destroy(); cy = null; } }

function setTreeMsg(s) {
  const m = $("treemsg");
  m.textContent = s || "";
  m.classList.toggle("show", !!s);
}

// A node's outgoing subtree, over the tree edges only (a dashed back-edge to a
// subroutine's group is not part of it). The same hide/show folds a group, a
// repeat body, or -- once words carry their letters -- a word into its letters.
function subtree(node) {
  const nodes = cy.collection(), edges = cy.collection();
  const stack = [node], seen = new Set([node.id()]);
  while (stack.length) {
    stack.pop().outgoers('edge[kind="seq"]').forEach((e) => {
      edges.merge(e);
      const tgt = e.target();
      if (!seen.has(tgt.id())) { seen.add(tgt.id()); nodes.merge(tgt); stack.push(tgt); }
    });
  }
  return nodes.union(edges);
}
function setFolded(n, on) {
  const kids = subtree(n);
  if (!kids.length) return false;
  if (on) { kids.hide(); n.addClass("collapsed"); n.data("label", n.data("baseLabel") + "\n⊕"); }
  else    { kids.show(); n.removeClass("collapsed"); n.data("label", n.data("baseLabel")); }
  return true;
}
function toggleFold(n) {
  if (setFolded(n, !n.hasClass("collapsed")))
    cy.layout(dagreLayout()).run();
}

function drawTree(g) {
  destroyTree();
  cy = window.cytoscape({
    container: $("cy"),
    elements: buildTreeElements(g),
    style: treeStyle(),
    layout: { name: "preset" },   // fold words first, then lay out once
    wheelSensitivity: 0.25,
    minZoom: 0.1, maxZoom: 3
  });
  cy.on("tap", "node", (ev) => toggleFold(ev.target));
  // A literal word carries its letters as children; it starts folded to a
  // single box, and a click unfolds 'cat' into 'c' 'a' 't'.
  cy.nodes('[kind="literal"]').forEach((n) => {
    if (n.outgoers('edge[kind="seq"]').length) setFolded(n, true);
  });
  cy.layout(dagreLayout()).run();
  // A handle for the console and the browser tests to reach the graph.
  window.__rxeCy = cy;
}

// Fetch the graph and draw it. Called on entering the Tree tab and whenever the
// expression changes while it is showing. 'path' is a decimal index the walk
// lights the route to, tying the tree to a chosen member.
let treeToken = 0;
async function renderTree(opts = {}) {
  if (state.tab !== "tree") return;
  if (!state.ok) { destroyTree(); setTreeMsg(t("treeEmpty")); return; }
  const path = opts.path !== undefined ? opts.path : treePath;
  const token = ++treeToken;
  setTreeMsg(t("treeLoading"));
  try { await ensureCytoscape(); }
  catch { setTreeMsg("The tree view could not load."); return; }
  // The expression may have changed, or the tab closed, while the libraries or
  // the graph were in flight; a stale render must not paint over a newer one.
  if (token !== treeToken || state.tab !== "tree") return;
  const expandSubs = $("treesubs").checked;
  const g = await call("tree", { collapse: !expandSubs, fold: true, path });
  if (token !== treeToken || state.tab !== "tree") return;
  if (!g || !g.nodes || !g.nodes.length) { destroyTree(); setTreeMsg(t("treeEmpty")); return; }
  setTreeMsg("");
  drawTree(g);
}

// Read the "light member" field and light the route to it: a bare decimal is
// an index seeked straight to; anything else is a member string, ranked to the
// first index it sits at. An empty field, a non-member, or an unrankable set
// simply lights nothing.
let lightTimer = null;
async function resolveLight() {
  const v = $("treeidx").value.trim();
  if (!v) { treePath = ""; renderTree({ path: "" }); return; }
  if (/^\d+$/.test(v)) { treePath = v; renderTree({ path: v }); return; }
  const r = await call("rankFirst", { text: v });
  treePath = (r && r.index) ? r.index : "";
  renderTree({ path: treePath });
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
  if (state.key !== want) {
    state.key = want;
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
  const key = (state.key || "").trim();
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

/* ------------------------------------------------------------------- share */

// The workbench state, small keys, defaults omitted, so a bare pattern shares
// as a short link. 'from' is a decimal string because it can be a bignum.
function currentShareState() {
  const s = { p: $("pattern").value };
  const code = $("code").value.trim(), key = (state.key || "").trim();
  if (code) s.c = code;
  if (key) s.k = key;
  if (state.from !== 0n) s.f = state.from.toString();
  if (state.per !== 50) s.n = state.per;
  if (!state.zeroBased) s.z = false;
  // On the Search tab the link carries the query, so it reopens on the same
  // lookup rather than the enumeration.
  if (state.tab === "search") s.q = $("findtext").value;
  // The Tree tab has no query of its own; the link just names it so it reopens
  // on the tree rather than the enumeration.
  if (state.tab === "tree") s.tab = "tree";
  // A link to an example carries its id and the language it was read in, so
  // the receiver lands on the same example -- note, bookmarks and all -- and,
  // for one whose regex differs by language (Powerball vs Mega-Sena), on the
  // same variant. The pattern text rides along too, as a fallback for a link
  // whose example no longer exists.
  if (state.selected) { s.sel = state.selected; s.lang = lang; }
  return s;
}

function applyShareState(s) {
  // An example link names an example and the language it was read in. Pin the
  // language first (this also swaps in that language's regex via applyLanguage),
  // then take the pattern from the live example so the link tracks the current
  // definition. A link whose example has since vanished falls back to s.p.
  const ex = (typeof s.sel === "string")
    ? allExamples().find((e) => e.id === s.sel) : null;
  if (ex) {
    state.selected = ex.id;
    if (typeof s.lang === "string" && LANGS[s.lang] && s.lang !== lang)
      setLang(s.lang);
    $("pattern").value = (ex.flags ? "(?" + ex.flags + ")" : "") + examplePattern(ex);
    $("code").value = ex.code || "";
  } else {
    state.selected = null;
    if (typeof s.p === "string") $("pattern").value = s.p;
    $("code").value = typeof s.c === "string" ? s.c : "";
  }
  setCodeVisible(!!$("code").value); refreshCodeToggle();
  state.key = typeof s.k === "string" ? s.k : "";
  state.per = (typeof s.n === "number" && s.n >= 1 && s.n <= 1000) ? s.n : 50;
  $("per").value = String(state.per);
  state.zeroBased = s.z !== false;
  syncZero();
  try { state.from = BigInt(s.f || "0"); } catch { state.from = 0n; }
  if (state.from < 0n) state.from = 0n;
  $("from").value = (state.from + (state.zeroBased ? 0n : 1n)).toString();
  // A link may carry a search: fill it and open the Search tab, so the receiver
  // lands on the same lookup. reparse runs it once the expression is parsed.
  if (typeof s.q === "string") {
    $("findtext").value = s.q;
    setTab("search");
  } else if (s.tab === "tree") {
    setTab("tree");
  } else {
    setTab("elements");
  }
  renderNote(); renderLibrary();
}

// UTF-8-safe, URL-safe base64: patterns and code hold arbitrary text.
function encodeState(o) {
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeState(b64) {
  const s = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Build the sharable URL and put it in the address bar (without adding a
// history entry), so it is also copyable from there if all else fails.
function shareUrl() {
  const url = location.href.replace(/#.*$/, "") + "#s=" + encodeState(currentShareState());
  history.replaceState(null, "", url);
  return url;
}

function readShareHash() {
  const h = location.hash || "";
  if (!h.startsWith("#s=")) return null;
  try { return decodeState(h.slice(3)); } catch { return null; }
}

function setShareLabel() {
  // The button is an icon now; its label lives in the tooltip.
  $("share").title = $("share2").title =
    navigator.share ? t("share") : t("shareCopy");
}

let flashTimer = null;
function flashCopied() {
  // Flash the share button of whichever tab is showing -- each has its own.
  const c = $(state.tab === "search" ? "copied2" : state.tab === "tree" ? "copied3" : "copied");
  const btn = $(state.tab === "search" ? "share2" : state.tab === "tree" ? "share3" : "share");
  c.textContent = t("shareCopied");
  c.hidden = false;
  btn.classList.add("done");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { c.hidden = true; btn.classList.remove("done"); }, 1600);
}

// Native share sheet where there is one (phones, and some desktops); a
// clipboard copy otherwise. Either way the URL is in the address bar.
async function doShare() {
  if (!$("pattern").value) return;
  const url = shareUrl();
  if (navigator.share) {
    try { await navigator.share({ title: "rxenum", url }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }  // cancelled; do nothing
  }
  try { await navigator.clipboard.writeText(url); } catch { /* address bar has it */ }
  flashCopied();
}

/* ------------------------------------------------------------------ export */

// A run of members, from the current index onward, written to a file. The good
// path streams straight to disk with the File System Access API, so the whole
// export never sits in memory at once; Firefox and Safari lack it, so there we
// build a Blob and download it, which the count field lets the user size (and,
// if they insist, overrun). Members ride the same per-member cap as the page;
// raise it with ?maxlen= for whole ones.

let exportAbort = false;

function openExportBox() {
  if (!state.ok) return;
  const off = state.zeroBased ? 0n : 1n;
  $("exportfrom").textContent =
    t("exportFrom").replace("{i}", group((state.from + off).toString()));
  // Default to the rest of a finite set when that is a modest number, otherwise
  // a round handful the user can raise.
  let def = 100000n;
  if (state.count) {
    const remaining = BigInt(state.count) - state.from;
    if (remaining > 0n && remaining < 1000000n) def = remaining;
  }
  $("exportcount").value = def.toString();
  $("exportindex").checked = false;
  // The element/transformed/both choice is only meaningful with a transform;
  // hide it otherwise. Its value is left as the user last set it (both to start).
  $("exportcolswrap").hidden = !state.codeActive;
  $("exportmem").hidden = !!window.showSaveFilePicker;   // warn only on the Blob path
  $("exportrun").hidden = true;
  $("exportstatus").textContent = "";
  $("exportgo").disabled = false;
  $("exportbox").showModal();
}

// One member per line. Which columns and how they are joined is the caller's
// choice: an optional index, then the element and/or the code's output (o.cols
// is "element", "output" or "both"), joined by o.sep. Each field is encoded by
// its nature: a member is a byte string, written verbatim (the bytes rxenum
// would print, which are already UTF-8 when it holds text); the code's output
// is a JS string, so it is UTF-8 encoded, which is what carries ♠♥♦♣ and the
// like through to the file. Index and separator are ASCII, so either agrees.
function bytesForRows(rows, o) {
  const enc = new TextEncoder();
  const raw = (s) => {                               // a member: bytes as they are
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff;
    return a;
  };
  const sep = enc.encode(o.sep), nl = enc.encode("\n");
  const chunks = [];
  for (const r of rows) {
    const fields = [];
    if (o.withIndex) fields.push(enc.encode((BigInt(r.index) + o.off).toString()));
    const out = enc.encode(r.output != null ? r.output : "");
    if (o.cols === "output") fields.push(out);
    else if (o.cols === "both") { fields.push(raw(r.value)); fields.push(out); }
    else fields.push(raw(r.value));
    fields.forEach((fld, i) => { if (i) chunks.push(sep); chunks.push(fld); });
    chunks.push(nl);
  }
  let n = 0; for (const c of chunks) n += c.length;
  const b = new Uint8Array(n);
  let p = 0; for (const c of chunks) { b.set(c, p); p += c.length; }
  return b;
}

function downloadBytes(parts, name) {
  const url = URL.createObjectURL(new Blob(parts, { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function runExport() {
  if (!state.ok) return;
  let total;
  try { total = BigInt(($("exportcount").value || "").replace(/[^0-9]/g, "") || "0"); }
  catch { total = 0n; }
  if (total <= 0n) return;
  if (state.count) {                             // never walk past a finite set
    const remaining = BigInt(state.count) - state.from;
    if (remaining <= 0n) { $("exportbox").close(); return; }
    if (total > remaining) total = remaining;
  }
  const SEPS = { tab: "\t", space: " ", comma: "," };
  const o = {
    withIndex: $("exportindex").checked,
    off: state.zeroBased ? 0n : 1n,
    sep: SEPS[$("exportsep").value] || "\t",
    // The columns choice only means anything with a transform running; without
    // one there is nothing but the element to write.
    cols: state.codeActive ? $("exportcols").value : "element"
  };

  let writable = null, parts = null;
  if (window.showSaveFilePicker) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: "rxenum-export.txt",
        types: [{ description: "Text", accept: { "text/plain": [".txt"] } }]
      });
    } catch { return; }                          // user dismissed the picker
    writable = await handle.createWritable();
  } else {
    parts = [];
  }

  exportAbort = false;
  $("exportgo").disabled = true;
  $("exportrun").hidden = false;
  const prog = $("exportprog");
  const BATCH = 512;
  let done = 0n, from = state.from;
  try {
    while (done < total && !exportAbort) {
      const want = total - done < BigInt(BATCH) ? Number(total - done) : BATCH;
      const r = await call("rows", { from: from.toString(), n: want });
      const rows = r.rows || [];
      if (!rows.length) break;                   // reached the end
      const bytes = bytesForRows(rows, o);
      if (writable) await writable.write(bytes);
      else parts.push(bytes);
      done += BigInt(rows.length);
      from += BigInt(rows.length);
      prog.value = Number((done * 1000n) / total) / 10;
      $("exportstatus").textContent = t("exportProgress")
        .replace("{done}", group(done.toString()))
        .replace("{total}", group(total.toString()));
    }
  } finally {
    if (writable) { try { await writable.close(); } catch { /* partial file kept */ } }
  }
  if (parts && !exportAbort) downloadBytes(parts, "rxenum-export.txt");
  $("exportgo").disabled = false;
  $("exportbox").close();
}

function wire() {
  $("lang").innerHTML = Object.entries(LANGS)
    .map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  $("lang").value = lang;
  $("lang").onchange = () => setLang($("lang").value);

  $("pattern").oninput = () => {
    state.selected = null; renderNote(); renderLibrary(); renderBookmarks();
    scheduleReparse();
  };
  $("code").oninput = () => {
    state.selected = null; renderNote(); renderLibrary(); refreshCodeToggle();
    clearTimeout(reparseTimer);
    reparseTimer = setTimeout(async () => { await applyCode(); refreshTable(); }, 300);
  };
  // The </> button folds the code section in and out; a fresh open lands the
  // cursor in it so the reader can start typing at once.
  $("codetoggle").onclick = () => {
    const on = $("codewrap").hidden;
    setCodeVisible(on);
    if (on) $("code").focus();
  };

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
  for (const b of document.querySelectorAll(".zerotgl")) b.onclick = toggleZero;
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
    renderRows(r.rows || [], !!r.overflow);
  };
  for (const b of document.querySelectorAll(".etab"))
    b.onclick = () => setTab(b.dataset.etab);
  // Search as you type, like the other inputs, so there is no button to press.
  const searchSoon = () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 200); };
  $("findtext").oninput = searchSoon;
  $("findcap").oninput = searchSoon;

  $("share").onclick = doShare;
  $("share2").onclick = doShare;
  $("share3").onclick = doShare;

  // Tree controls. Fit re-frames the whole tree; Rotate swaps top-down for
  // left-right (concatenation reads better along the text); the checkbox draws
  // a (?N) subroutine in full rather than as a link and redraws.
  $("treefit").onclick = () => { if (cy) cy.fit(undefined, 24); };
  $("treedir").onclick = () => {
    treeDir = treeDir === "TB" ? "LR" : "TB";
    if (cy) cy.layout(dagreLayout()).run();
  };
  $("treesubs").onchange = () => renderTree();
  const lightSoon = () => { clearTimeout(lightTimer); lightTimer = setTimeout(resolveLight, 250); };
  $("treeidx").oninput = lightSoon;
  $("export").onclick = openExportBox;
  $("exportform").onsubmit = (e) => { e.preventDefault(); runExport(); };
  $("exportcancel").onclick = () => { exportAbort = true; $("exportbox").close(); };

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

  // The library folds away on small screens. The toggle is its header; a tab
  // switch reopens it so the new pane is not hidden.
  $("libtoggle").onclick = () => {
    const collapsed = $("left").classList.toggle("lib-collapsed");
    $("libtoggle").setAttribute("aria-expanded", String(!collapsed));
  };
  // On a small screen the library sits first but starts folded, so the page
  // opens on a slim header and the workbench, not a wall of examples.
  if (window.matchMedia("(max-width: 900px)").matches) {
    $("left").classList.add("lib-collapsed");
    $("libtoggle").setAttribute("aria-expanded", "false");
  }
  // The landscape nudge: shown until the reader taps an example, then never
  // again.
  if (localStorage.getItem(STORE_ORIENT) === "off")
    $("orient").classList.add("dismissed");
  $("orientx").onclick = dismissOrient;

  $("libsearch").oninput = renderLibrary;
  for (const b of document.querySelectorAll("#libtabs .subtab"))
    b.onclick = () => setFilter(b.dataset.filter);

  // The on-ramp: newcomers land on the first tutorial step, veterans on the
  // first highlight -- each also switching the filter so the neighbours show,
  // and unfolding the library so that switch is visible on a small screen.
  $("ob-new").onclick = (e) => {
    e.preventDefault();
    expandLibrary();
    setFilter("tutorial");
    const ex = allExamples().find((x) => x.tutorial);
    if (ex) selectExample(ex);
  };
  $("ob-best").onclick = (e) => {
    e.preventDefault();
    expandLibrary();
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
    // Reopen the pane so the tab you just chose is not hidden behind a collapse.
    expandLibrary();
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
    const bkey = (state.key || "").trim();
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
  syncZero();                       // light the numbering toggle to match state
  await classifyExamples();
  const shared = readShareHash();
  if (shared) { applyShareState(shared); reparse(); }
  else if ($("pattern").value) reparse();
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
  await call("setMaxMember", { bytes: state.maxMember });
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
