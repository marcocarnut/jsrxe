// Regenerates web/dicts.js from the word lists in dicts/.
//
// The lists themselves come from elsewhere and are kept under dicts/ so the
// generated module is reproducible: bip39en.dict is the BIP-39 English
// standard, and the two diceware lists are extracted from dw4.pl in the rxe
// repository. Run this after changing any of them:
//
//     node tools/gen-dicts.mjs
//
// The words are embedded rather than fetched at runtime because the
// single-file build has no server to fetch from.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const words = (f) => readFileSync(root + "dicts/" + f, "utf8")
  .split(/\r?\n/).map((w) => w.trim()).filter(Boolean);

// id, source file, bilingual name, bilingual note.
const META = [
  ["bip39en", "bip39en.dict",
   { en: "BIP-39 English", pt: "BIP-39 inglês" },
   { en: "The 2048 words of the Bitcoin seed-phrase standard. '[:bip39en:]{24}' is every 24-word phrase: 2048^24, exactly 2^264.",
     pt: "As 2048 palavras do padrão de frase-semente do Bitcoin. '[:bip39en:]{24}' é toda frase de 24 palavras: 2048^24, exatamente 2^264." }],
  ["diceware4en", "diceware4en.dict",
   { en: "Diceware 4 (English)", pt: "Diceware 4 (inglês)" },
   { en: "1296 four-letter English words, one per throw of four dice. '[:diceware4en:]{6}' is a six-word passphrase.",
     pt: "1296 palavras inglesas de quatro letras, uma por lançamento de quatro dados. '[:diceware4en:]{6}' é uma frase de seis palavras." }],
  ["diceware4ptbr", "diceware4ptbr.dict",
   { en: "Diceware 4 (Portuguese)", pt: "Diceware 4 (português)" },
   { en: "1296 four-letter Brazilian Portuguese words. '[:diceware4ptbr:]{6}' is a six-word passphrase in Portuguese.",
     pt: "1296 palavras de quatro letras em português brasileiro. '[:diceware4ptbr:]{6}' é uma frase de seis palavras em português." }],
  ["efflarge", "efflarge.dict",
   { en: "EFF Large (7776)", pt: "EFF Grande (7776)" },
   { en: "The EFF's recommended list -- 7776 words, one per roll of five dice. A six-word phrase, '[:efflarge:]( [:efflarge:]){5}', is 7776^6, about 2^77. (EFF, CC BY 3.0 US.)",
     pt: "A lista recomendada pela EFF -- 7776 palavras, uma por lançamento de cinco dados. Uma frase de seis palavras, '[:efflarge:]( [:efflarge:]){5}', é 7776^6, cerca de 2^77. (EFF, CC BY 3.0 US.)" }],
  ["effshort1", "effshort1.dict",
   { en: "EFF Short #1 (1296)", pt: "EFF Curta #1 (1296)" },
   { en: "1296 short, easy-to-type words, one per four dice. The EFF's choice when typing effort matters more than length. (EFF, CC BY 3.0 US.)",
     pt: "1296 palavras curtas e fáceis de digitar, uma por quatro dados. A escolha da EFF quando o esforço de digitação importa mais que o comprimento. (EFF, CC BY 3.0 US.)" }],
  ["effshort2", "effshort2.dict",
   { en: "EFF Short #2 (1296)", pt: "EFF Curta #2 (1296)" },
   { en: "1296 words, each with a unique three-letter prefix, so a typo is caught early and autocomplete needs only three letters. (EFF, CC BY 3.0 US.)",
     pt: "1296 palavras, cada uma com um prefixo único de três letras, para que um erro de digitação seja pego cedo e o autocompletar precise de só três letras. (EFF, CC BY 3.0 US.)" }],
  ["dicewareorig", "dicewareorig.dict",
   { en: "Diceware original (7776)", pt: "Diceware original (7776)" },
   { en: "Arnold Reinhold's original 1995 Diceware list: 7776 entries, one per five dice, including some numbers and symbols. A five-word phrase is 7776^5, about 2^65.",
     pt: "A lista Diceware original de Arnold Reinhold, de 1995: 7776 entradas, uma por cinco dados, incluindo alguns números e símbolos. Uma frase de cinco palavras é 7776^5, cerca de 2^65." }]
];

let out = "// The built-in word dictionaries, referenced as [:name:] in a pattern.\n";
out += "// Generated from the lists in dicts/ by tools/gen-dicts.mjs; do not edit.\n\n";
out += "export const BUILTIN_DICTS = [\n";
for (const [id, file, name, note] of META) {
  const w = words(file);
  out += "  {\n";
  out += `    id: ${JSON.stringify(id)},\n`;
  out += `    name: ${JSON.stringify(name)},\n`;
  out += `    note: ${JSON.stringify(note)},\n`;
  out += `    words: ${JSON.stringify(w)}\n`;
  out += "  },\n";
}
out += "];\n";
writeFileSync(root + "web/dicts.js", out);
console.log("wrote web/dicts.js from", readdirSync(root + "dicts").length, "lists");
