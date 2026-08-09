// Everything the interface asks of the library, with nothing around it.
//
// This knows about neither the worker nor the page, which is what lets the
// same code be driven from a browser and from node. The browser-side test
// checks the plumbing; tests/node.mjs checks the answers, headlessly, against
// values the command-line tool prints.
//
// Indices are decimal strings throughout. They routinely exceed what a double
// holds exactly -- '[0-9a-f]{8}-...' has 2^122 members -- and a decimal string
// round-trips through BigInt losslessly, which a number does not.

export const RXE_CASELESS      = 0x0001;
export const RXE_DOTALL        = 0x0002;
export const RXE_LEFT_TO_RIGHT = 0x0004;

// 'randomBytes' is the one thing here that cannot be pure, so it is passed in
// rather than reached for: browsers have had globalThis.crypto for years, node
// only since 19, and a caller may reasonably want a seeded source instead.
//
// 'makeTransform' turns an example's code into a function applied to each
// generated element. It is injected the same way, so that engine.js has no
// opinion on how the code is compiled and the tests can hand it a plain
// function instead of a string.

export function makeEngine(Module, {
  randomBytes = (n) => {
    const buf = new Uint8Array(n);
    globalThis.crypto.getRandomValues(buf);
    return buf;
  },
  makeTransform = null
} = {}) {
  const c = (name, ret, args) => Module.cwrap(name, ret, args);
  const api = {
    parse:        c("rxe_js_parse",               "number", ["string","number"]),
    release:      c("rxe_js_release",             null,     ["number"]),
    free:         c("rxe_js_free",                null,     ["number"]),
    error:        c("rxe_js_error",               "number", ["number"]),
    errorMessage: c("rxe_js_error_message",       "number", ["number"]),
    isInfinite:   c("rxe_js_is_infinite",         "number", ["number"]),
    isShortlex:   c("rxe_js_is_shortlex",         "number", ["number"]),
    count:        c("rxe_js_count",               "number", ["number"]),
    countAt:      c("rxe_js_count_at_length",     "number", ["number","number"]),
    seek:         c("rxe_js_seek",                "number", ["number","string"]),
    current:      c("rxe_js_current",             "number", ["number","number"]),
    permNew:      c("rxe_js_permutation_new",     "number", ["string","string"]),
    permRelease:  c("rxe_js_permutation_release", null,     ["number"]),
    permMap:      c("rxe_js_permutation_map",     "number", ["number","string"]),
    registerDict: c("rxe_js_register_dict",       null,     ["string","string"]),
    freeDicts:    c("rxe_js_free_dicts",           null,     []),
    setMaxMember: c("rxe_js_set_max_member",      null,     ["number"]),
    checkOverflow:c("rxe_js_check_overflow",      "number", [])
  };

  let rxe = 0;        // the parsed expression
  let perm = 0;       // the keyed permutation, when one is set
  let permCount = null; // its domain, so a keyed page never runs past the set
  let transform = null; // the example's code, applied to each element

  // Take ownership of a char* the library allocated.
  const takeString = (ptr) => {
    if (!ptr) return null;
    const s = Module.UTF8ToString(ptr);
    api.free(ptr);
    return s;
  };

  // The selected element. Members may hold any byte value, including ones
  // that are not valid UTF-8 and zero itself, so this reads by the reported
  // length rather than to a terminator and maps bytes one to one onto code
  // points -- the page can then show a control character as such instead of
  // losing it.
  const currentElement = () => {
    const lenPtr = Module._malloc(4);
    const ptr = api.current(rxe, lenPtr);
    if (!ptr) { Module._free(lenPtr); return ""; }
    const len = Module.HEAP32[lenPtr >> 2];
    let out = "";
    for (let i = 0; i < len; i++) out += String.fromCharCode(Module.HEAPU8[ptr + i]);
    api.free(ptr);
    Module._free(lenPtr);
    return out;
  };

  const clearPerm = () => { if (perm) { api.permRelease(perm); perm = 0; } permCount = null; };
  const clearRxe = () => { clearPerm(); if (rxe) { api.release(rxe); rxe = 0; } };

  // Where an index actually lands. With a shuffle key the two differ: the key
  // permutes the index before the seek, which is what walks the whole set in
  // a scattered but reproducible order.
  const targetFor = (index) =>
    perm ? (takeString(api.permMap(perm, index)) || index) : index;

  // A row, with the transform's output attached when there is one. The
  // transform runs in its own try: an example's code is under the user's
  // control and may throw, and one bad row should not blank the page.
  const withTransform = (index, value) => {
    const row = { index, value };
    if (transform) {
      try { row.output = String(transform(value, index)); }
      catch (e) { row.output = ""; row.error = String(e && e.message ? e.message : e); }
    }
    return row;
  };

  return {

    parse({ pattern, flags }) {
      clearRxe();
      let f = 0;
      if (flags.includes("i")) f |= RXE_CASELESS;
      if (flags.includes("s")) f |= RXE_DOTALL;
      if (flags.includes("L")) f |= RXE_LEFT_TO_RIGHT;
      rxe = api.parse(pattern, f);
      if (!rxe) return { ok: false, error: "out of memory" };
      if (api.error(rxe)) {
        const error = takeString(api.errorMessage(rxe));
        clearRxe();
        return { ok: false, error };
      }
      const infinite = !!api.isInfinite(rxe);
      return {
        ok: true,
        infinite,
        shortlex: !!api.isShortlex(rxe),
        count: infinite ? null : takeString(api.count(rxe))
      };
    },

    // Compile and install an example's code, or clear it. Returns whether it
    // compiled; a transform that throws only at run time fails per row, which
    // is the row's business rather than this call's.
    code({ source }) {
      transform = null;
      if (!source || !makeTransform) return { ok: true, active: false };
      try { transform = makeTransform(source); return { ok: true, active: true }; }
      catch (e) { return { ok: false, error: String(e && e.message ? e.message : e) }; }
    },

    // Set or clear the shuffle key. A permutation is over [0, count), so it
    // needs a finite set to be a permutation of.
    key({ key, count }) {
      clearPerm();
      if (!key || !count || count === "0") return { ok: true, active: false };
      perm = api.permNew(count, key);
      if (perm) permCount = BigInt(count);
      return { ok: true, active: !!perm };
    },

    // A window of the enumeration. Each row is sought independently, which is
    // why a page anywhere in the set costs the same as the first one. When an
    // example carries code, each element is passed through it and the result
    // shown alongside -- a check digit appended, a hash compared, and so on.
    rows({ from, n }) {
      if (!rxe) return { rows: [] };
      api.checkOverflow();               // clear any stale latch first
      const rows = [];
      let index = BigInt(from);
      for (let i = 0; i < n; i++) {
        if (index < 0n) break;
        // With a key the walk is a permutation of [0, count); there is nothing
        // beyond it, and asking the map for an out-of-range index is exactly
        // what used to spin.
        if (perm && permCount !== null && index >= permCount) break;
        if (api.seek(rxe, targetFor(index.toString()))) break;
        rows.push(withTransform(index.toString(), currentElement()));
        index += 1n;
      }
      // A member too large to build stops the seek, so the page can come back
      // short; the flag lets the page say why rather than look merely empty.
      return { rows, overflow: !!api.checkOverflow() };
    },

    // Set the per-member byte cap. Below it members render whole; above it
    // they are trimmed and the page is told, so it can admonish rather than
    // choke the DOM on a giant string.
    setMaxMember({ bytes }) {
      api.setMaxMember(bytes | 0);
      return {};
    },

    // Uniformly chosen members. The range is the library's idea of the set's
    // size rather than a rounded double, and the surplus bytes put the modulo
    // bias far below anything that could show.
    random({ count, n }) {
      if (!rxe || !count || count === "0") return { rows: [] };
      api.checkOverflow();
      const total = BigInt(count);
      const bytes = Math.ceil(total.toString(2).length / 8) + 8;
      const rows = [];
      for (let i = 0; i < n; i++) {
        const buf = randomBytes(bytes);
        let v = 0n;
        for (const b of buf) v = (v << 8n) | BigInt(b);
        const index = v % total;
        if (api.seek(rxe, index.toString())) continue;
        rows.push(withTransform(index.toString(), currentElement()));
      }
      return { rows, overflow: !!api.checkOverflow() };
    },

    // How many members have each length. Meaningful for every expression, and
    // the only size an infinite one has to report.
    lengths({ max }) {
      if (!rxe) return { counts: [] };
      const counts = [];
      for (let L = 0; L <= max; L++) counts.push(takeString(api.countAt(rxe, L)));
      return { counts };
    },

    // Make [:name:] draw from these words. The words cross the boundary as one
    // newline-joined string, which the binding splits.
    registerDict({ name, words }) {
      api.registerDict(name, words.join("\n"));
      return { ok: true };
    },

    // Forget every registered dictionary, so the caller can re-register the
    // set that remains after one is removed.
    freeDicts() { api.freeDicts(); return { ok: true }; },

    // The index of the first member of each length, which is the running sum
    // of the counts before it. An infinite set has no proportion to slide
    // along, but it does have this: jumping to a length is the coarse
    // movement that a scrollbar would otherwise provide, and it is the
    // structure the enumeration actually has rather than an arbitrary
    // exponential scale laid over it.
    lengthStarts({ max }) {
      if (!rxe) return { starts: [] };
      const starts = [];
      let running = 0n;
      for (let L = 0; L <= max; L++) {
        starts.push(running.toString());
        const c = takeString(api.countAt(rxe, L));
        running += BigInt(c || "0");
        // Past this there is nothing useful to offer: the index would be too
        // long to type, let alone reach by scrolling.
        if (running > 10n ** 40n) break;
      }
      return { starts };
    },

    // Whether each of several expressions is infinite. The page uses this to
    // sort its examples rather than guessing from the text of the pattern,
    // which got '\\+55 \\d{2} 9\\d{4}-\\d{4}' wrong: the escaped plus in a
    // Brazilian mobile number looks exactly like a quantifier.
    classify({ patterns }) {
      const out = [];
      for (const p of patterns) {
        clearRxe();
        rxe = api.parse(p.pattern, 0);
        out.push({
          id: p.id,
          ok: !!rxe && !api.error(rxe),
          infinite: !!rxe && !api.error(rxe) && !!api.isInfinite(rxe)
        });
      }
      clearRxe();
      return { classified: out };
    }
  };
}
