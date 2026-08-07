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

// mod 11 with the classic Brazilian weighting, shared by CPF and CNPJ. Each
// character counts as its code point minus 48, which is why the alphanumeric
// CNPJ works unchanged: a digit's value is itself, and a letter continues
// upward from A = 17.
function mod11(chars, weights) {
  let sum = 0;
  for (let i = 0; i < chars.length; i++)
    sum += (chars.charCodeAt(i) - 48) * weights[i];
  const r = 11 - (sum % 11);
  return r > 9 ? 0 : r;
}

const HELPERS = {
  sha256,
  mod11,

  // The two Brazilian check digits, given the base and the two weight rows.
  // Returned as a two-character string, most significant first.
  checkDigits(base, w1, w2) {
    const d1 = mod11(base, w1);
    const d2 = mod11(base + d1, w2);
    return "" + d1 + d2;
  },

  // Keep only the characters matching a class, e.g. digitsOf("12.345") ==
  // "12345". Handy for stripping a formatted number back to its payload.
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
  { sig: "lib.mod11(chars, weights)",
    en: "One Brazilian check digit: sum of (code point − 48) times weight, mod 11, folded to 0 above 9.",
    pt: "Um dígito verificador brasileiro: soma de (código − 48) vezes peso, mod 11, dobrado a 0 acima de 9." },
  { sig: "lib.checkDigits(base, w1, w2)",
    en: "Both check digits as a two-character string, the second computed over the base plus the first.",
    pt: "Os dois dígitos como texto de dois caracteres, o segundo calculado sobre a base mais o primeiro." },
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
