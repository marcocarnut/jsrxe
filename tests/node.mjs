// The binding layer, checked without a browser.
//
// The engine is already proved: librxe's own suite runs against the
// WebAssembly build through bin/rxenum-wasm. What is unproved is the layer
// between it and the page -- that an index survives as a decimal string
// rather than a rounded double, that a member's bytes arrive intact, that the
// permutation and the per-length counts are reachable, and that a rejected
// expression comes back with its reason. That layer is web/engine.js, and
// this drives exactly the code the browser drives.
//
// Every expected value here is one the command-line tool prints.

import { randomFillSync } from "node:crypto";
import createLibrxe from "../build/librxe-node.mjs";
import { makeEngine } from "../web/engine.js";
import { makeTransform } from "../web/sandbox.js";

let pass = 0, fail = 0;

function check(what, want, got) {
  if (String(want) === String(got)) { pass++; return; }
  fail++;
  console.log(`FAIL  ${what}\n        expected: ${want}\n        got:      ${got}`);
}

const Module = await createLibrxe();
// node only made globalThis.crypto a global in version 19, and this should
// run under whatever node is to hand.
const e = makeEngine(Module, {
  randomBytes: (n) => randomFillSync(new Uint8Array(n)),
  makeTransform
});
const value = (r) => r.rows.map((x) => x.value).join(",");

// --- a finite set: the count is exact, not a rounded double
let r = e.parse({ pattern: "[0-9A-Za-z]{8}", flags: "" });
check("[0-9A-Za-z]{8} parses", true, r.ok);
check("  its count is exact", "218340105584896", r.count);
check("  it is finite", false, r.infinite);
check("  ordered by place value", false, r.shortlex);

// --- radix conversion, the documented property of the default order
e.parse({ pattern: "([0-9A-F]{4} ){2}", flags: "" });
check("index 3735928559 is DEAD BEEF", "DEAD BEEF ",
      value(e.rows({ from: "3735928559", n: 1 })));

// --- and it reverses under -L
e.parse({ pattern: "([0-9A-F]{4} ){2}", flags: "L" });
check("  reversed under -L", "FEEB DAED ",
      value(e.rows({ from: "3735928559", n: 1 })));

// --- an index far past what a double holds exactly
e.parse({ pattern: "[0-9]{40}", flags: "" });
const big = "1234567890123456789012345678901234567890";
check("a 40-digit index survives the boundary", big,
      value(e.rows({ from: big, n: 1 })));

// --- a cardinality with 28,300 digits must arrive whole
r = e.parse({ pattern: "[a-z]{1,20000}", flags: "" });
check("a 28300-digit count arrives whole", 28300, r.count.length);

// --- an infinite set: no count, but every index still resolves
r = e.parse({ pattern: "[1-9][0-9]*", flags: "" });
check("[1-9][0-9]* is infinite", true, r.infinite);
check("  with no count", null, r.count);
check("  ordered shortest first", true, r.shortlex);
check("  and index 999999 is 1000000", "1000000",
      value(e.rows({ from: "999999", n: 1 })));

// --- the shape counting by length exists for
e.parse({ pattern: "(\\d+,)*", flags: "" });
check("(\\d+,)* members by length", "1,0,10,100,1100",
      e.lengths({ max: 4 }).counts.join(","));
check("  first two-element list at 1111", "0,0,",
      value(e.rows({ from: "1111", n: 1 })));
check("  and index 10^18 resolves", "587145910526315789,",
      value(e.rows({ from: "1000000000000000000", n: 1 })));

// --- a backreference keeps the diagonal order rather than being refused
r = e.parse({ pattern: "([ab]+)\\1", flags: "" });
check("([ab]+)\\1 is infinite", true, r.infinite);
check("  but not shortest first", false, r.shortlex);
check("  and still enumerates", "aa,bb,aaaa,abab",
      value(e.rows({ from: "0", n: 4 })));

// --- the keyed permutation: the same members, each exactly once
e.parse({ pattern: "[a-c][x-z]", flags: "" });
e.key({ key: "hunter2", count: "9" });
r = e.rows({ from: "0", n: 9 });
check("shuffled order matches the command line",
      "cx,az,by,bz,cy,cz,ay,ax,bx", value(r));
check("  and visits all nine", 9, new Set(r.rows.map((x) => x.value)).size);
e.key({ key: "", count: "9" });
check("  clearing the key restores index order", "ax,ay,az",
      value(e.rows({ from: "0", n: 3 })));

// A keyed page must never run past the set. Asking for fifty rows of a
// three-member set once spun forever: the map was handed indices past the
// domain and cycle-walked values the set does not contain. It must return
// exactly the three, and promptly.
e.parse({ pattern: "cat|dog|fish", flags: "" });
e.key({ key: "hello", count: "3" });
r = e.rows({ from: "0", n: 50 });
check("a keyed page stops at the end of a small set", 3, r.rows.length);
check("  and still visits every member", "cat,dog,fish",
      r.rows.map((x) => x.value).sort().join(","));
e.key({ key: "", count: "3" });

// --- the empty string is a member and must survive as one
e.parse({ pattern: "a?", flags: "" });
check("the empty string round-trips", "|a",
      e.rows({ from: "0", n: 2 }).rows.map((x) => x.value).join("|"));

// --- bytes that are not text must arrive intact
e.parse({ pattern: "\\x01\\xff", flags: "" });
check("arbitrary bytes survive", "1,255",
      [...e.rows({ from: "0", n: 1 }).rows[0].value]
        .map((c) => c.charCodeAt(0)).join(","));

// --- a rejected expression reports why
r = e.parse({ pattern: "a**", flags: "" });
check("a** is refused", false, r.ok);
check("  with a reason", "nested quantifiers", r.error);
r = e.parse({ pattern: "(a*)*", flags: "" });
check("  and so is (a*)*", "unbounded repetition of a possibly empty expression",
      r.error);

// --- seeking past the end stops rather than wrapping
e.parse({ pattern: "[ab]", flags: "" });
check("a two-member set yields two rows", 2,
      e.rows({ from: "0", n: 10 }).rows.length);

// --- the code column: a transform applied to each element
e.parse({ pattern: "[0-9]{9}", flags: "" });
e.code({ source:
  'var b = value.slice(0,9);' +
  'return b + lib.checkDigits(b, [10,9,8,7,6,5,4,3,2], [11,10,9,8,7,6,5,4,3,2]);' });
r = e.rows({ from: "111444777", n: 1 });
check("CPF check digits are computed", "11144477735", r.rows[0].output);

// the alphanumeric CNPJ, against Receita Federal's published example
e.parse({ pattern: "[0-9A-Z]{12}", flags: "" });
e.code({ source:
  'return value + lib.checkDigits(value,' +
  ' [5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2]);' });
// 12ABC34501DE seeks to a specific index; check the digits directly instead.
check("CNPJ 12ABC34501DE check digits are 35", "12ABC34501DE35",
      e.rows({ from: (() => {
        // find the index of 12ABC34501DE in [0-9A-Z]{12}
        const alpha = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let n = 0n;
        for (const ch of "12ABC34501DE") n = n * 36n + BigInt(alpha.indexOf(ch));
        return n.toString();
      })(), n: 1 }).rows[0].output);

// clearing the code drops the output again
e.code({ source: "" });
check("clearing the code removes the output", undefined,
      e.rows({ from: "0", n: 1 }).rows[0].output);

// a syntax error is reported, not thrown
let cr = e.code({ source: "return (" });
check("a syntax error in code is reported", false, cr.ok);

// a run-time throw is per-row, not fatal
e.parse({ pattern: "[ab]", flags: "" });
e.code({ source: "if (value === 'b') throw new Error('nope'); return value.toUpperCase();" });
r = e.rows({ from: "0", n: 2 });
check("a good row still computes", "A", r.rows[0].output);
check("a throwing row is flagged, not fatal", "nope", r.rows[1].error);
e.code({ source: "" });

// the sandbox has no reach into the surrounding scope
cr = e.code({ source: "return typeof makeEngine;" });
e.parse({ pattern: "a", flags: "" });
check("code cannot see the module's own names", "undefined",
      e.rows({ from: "0", n: 1 }).rows[0].output);
e.code({ source: "" });

// --- registered dictionaries: the path the Dictionaries tab uses
e.registerDict({ name: "animals", words: ["cat", "dog", "ferret"] });
r = e.parse({ pattern: "[:animals:]{2}", flags: "" });
check("a registered dictionary parses", true, r.ok);
check("  and is a product of its words", "9", r.count);
check("  seek picks the right phrase", "dogferret",
      e.rows({ from: "5", n: 1 }).rows[0].value);
// POSIX classes need no registration
r = e.parse({ pattern: "[:digit:]{2}", flags: "" });
check("a POSIX class needs no dictionary", "100", r.count);
// freeDicts makes a word dictionary stop resolving; POSIX classes remain
e.freeDicts();
r = e.parse({ pattern: "[:animals:]", flags: "" });
check("freeDicts drops the word dictionary", "unknown dictionary", r.error);
r = e.parse({ pattern: "[:digit:]", flags: "" });
check("but POSIX classes still resolve", "10", r.count);

// --- random members really are members
e.parse({ pattern: "[a-c][x-z]", flags: "" });
r = e.random({ count: "9", n: 40 });
check("random choices are all members", true,
      r.rows.length === 40 && r.rows.every((x) => /^[a-c][x-z]$/.test(x.value)));

console.log(fail ? `\nnode: ${fail} FAILED, ${pass} passed`
                 : `\nnode: all ${pass} binding checks passed`);
process.exit(fail ? 1 : 0);
