// Compiling an example's code into a function.
//
// The code is the user's own, but examples are meant to be shared -- exported,
// pasted, in time perhaps fetched -- so it is treated as if it came from
// somewhere untrusted. It is not a security boundary in the strong sense; a
// determined script can still reach the globals a worker exposes. What this
// does is make the accidental case safe and the interface small: the code is a
// function body with two parameters and a helper object, compiled in strict
// mode, with no lexical access to anything around it.
//
// The helper object is the whole standard library the code gets. Everything in
// it is pure and self-contained, so an example is reproducible and does not
// depend on what the host happens to have: the SHA-256 here is the one in
// sha256.js, not the browser's.

import { sha256 } from "./sha256.js";
import { BUILTIN_DICTS } from "./dicts.js";

// The built-in word lists, keyed by the same id a pattern uses as [:id:], so an
// example's code can reach the words behind a dictionary it enumerates -- e.g.
// lib.dict["diceware4en"][0]. Built on first access rather than at load: the
// single-file bundle concatenates this module ahead of dicts.js and strips the
// import, so reading the BUILTIN_DICTS const now would hit its temporal dead
// zone. By the time an example's code touches lib.dict every module has run.
let dictCache = null;

const HELPERS = {
  sha256,

  get dict() {
    if (!dictCache) {
      dictCache = {};
      for (const d of BUILTIN_DICTS) dictCache[d.id] = d.words;
    }
    return dictCache;
  },

  // Brazilian mod-11 check digits over the value's digits and letters, ignoring
  // any separators. Each character counts as its code point minus 48, so a
  // digit is worth itself and a letter carries on from A = 17 -- which is why
  // the one call serves the alphanumeric CNPJ as well. It returns `count` digits
  // (default 2), each folded into the base before the next is computed. The
  // weights climb 2, 3, 4, ... from the right; a positive `cap` cycles them back
  // to 2 once they pass it -- CPF lets them run (cap 0, up to 10 and 11), CNPJ
  // caps at 9.
  mod11(value, count = 2, cap = 0) {
    const base = String(value).replace(/[^0-9A-Z]/g, "");
    let out = "";
    for (let k = 0; k < count; k++) {
      const s = base + out;
      let sum = 0;
      for (let i = 0; i < s.length; i++) {
        const p = s.length - 1 - i;                  // distance from the right
        const w = cap > 0 ? (p % (cap - 1)) + 2 : p + 2;
        sum += (s.charCodeAt(i) - 48) * w;
      }
      const r = 11 - (sum % 11);
      out += (r > 9 ? 0 : r);
    }
    return out;
  },

  // The Luhn (mod 10) check digit that makes a card number valid, over the
  // value's digits (separators ignored): from the rightmost digit, double every
  // other one and cast a result over nine down by nine, sum, and return the
  // digit that brings the total to a multiple of ten. The check every terminal
  // runs.
  luhn(value) {
    const base = String(value).replace(/[^0-9]/g, "");
    let sum = 0, dbl = true;                // the rightmost digit doubles
    for (let i = base.length - 1; i >= 0; i--) {
      let d = base.charCodeAt(i) - 48;
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      dbl = !dbl;
    }
    return String((10 - (sum % 10)) % 10);
  },

  // Keep only the characters matching a class, e.g. keep("12.345", "0-9") ==
  // "12345". The check-digit helpers strip separators on their own now; this
  // stays for the odd case that wants a payload pulled out by hand.
  keep(s, re) { return s.replace(new RegExp("[^" + re + "]", "g"), ""); },

  toHex(s) {
    let out = "";
    for (let i = 0; i < s.length; i++)
      out += s.charCodeAt(i).toString(16).padStart(2, "0");
    return out;
  }
};

// Documentation for the Helpers tab, kept next to the helpers themselves so
// the two cannot drift. Signature and a line in each language.
export const HELPER_DOCS = [
  { sig: "lib.sha256(s)",
    en: "SHA-256 of the string's bytes, as 64 hex characters.",
    pt: "SHA-256 dos bytes da cadeia, em 64 caracteres hexadecimais." },
  { sig: 'lib.dict["diceware4en"]',
    en: "A built-in word list as an array, keyed by its [:id:] name (bip39en, diceware4en, efflarge, …).",
    pt: "Uma lista de palavras embutida como vetor, indexada pelo nome [:id:] (bip39en, diceware4en, efflarge, …)." },
  { sig: "lib.mod11(value, count, cap)",
    en: "Brazilian mod-11 check digits (count, default 2), ignoring separators. Weights climb 2,3,4,… from the right; cap>0 cycles them back to 2 above it (CNPJ 9, CPF 0).",
    pt: "Dígitos verificadores mod 11 (count, padrão 2), ignorando separadores. Os pesos sobem 2,3,4,… da direita; cap>0 os recicla a 2 acima dele (CNPJ 9, CPF 0)." },
  { sig: "lib.luhn(value)",
    en: "The Luhn (mod-10) check digit that makes a card number valid, over the value's digits, ignoring separators.",
    pt: "O dígito verificador de Luhn (mod 10) que valida um cartão, sobre os dígitos do valor, ignorando separadores." },
  { sig: 'lib.keep(s, "0-9A-Z")',
    en: "Keep only the characters in the class, e.g. stripping punctuation back to a payload.",
    pt: "Mantém só os caracteres da classe, p.ex. removendo pontuação para voltar à carga útil." },
  { sig: "lib.toHex(s)",
    en: "The bytes of the string as hexadecimal.",
    pt: "Os bytes da cadeia em hexadecimal." }
];

// Compile 'source' into (value, index) => result. Throws on a syntax error,
// which the caller reports; a run-time throw is left to the caller's per-row
// handling, since it may be true of some elements and not others.
export function makeTransform(source) {
  // Strict mode, three named parameters, and nothing else in scope: the
  // Function constructor closes over the global scope, not over this module,
  // so the code cannot see sha256 or anything else here except through 'lib'.
  const fn = new Function("value", "index", "lib",
    '"use strict";\n' + source);
  return (value, index) => fn(value, index, HELPERS);
}
