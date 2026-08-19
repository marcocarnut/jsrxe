// Builds dist/rxenum.html: the whole application in one file, openable from a
// file:// URL with no server at all.
//
// The served version cannot do that, and not for want of trying. A page opened
// from file:// has the opaque origin "null", and three separate things the
// application uses are refused across it: ES modules will not load, workers
// will not start, and fetching the .wasm is a cross-origin request. None of
// that is a browser being awkward -- it is the same-origin policy doing its
// job, since a local file could otherwise read its neighbours.
//
// So the single-file build gives up all three. The WebAssembly is inlined as
// base64 by Emscripten's SINGLE_FILE, the modules are concatenated into one
// classic script, and the library runs on the page's own thread behind the
// same transport seam the worker sits behind, so nothing above that line
// knows the difference. What is lost is only that a long seek now blocks the
// page for as long as it takes, which for anything a person would type is
// imperceptible.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFile(root + p, "utf8");

// Strip the module syntax: everything lands in one scope, so the imports have
// nothing to resolve and the exports nothing to export.
function demodule(src) {
  return src
    .replace(/^\s*import\s[^;]*?;\s*$/gm, "")
    // Drop the 'export ' keyword from a declaration, leaving the declaration
    // itself -- including an 'async function', which the plain form missed.
    .replace(/^export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\b)/gm, "");
}

const [libSingle, i18n, patterns, engine, sandbox, sha, dicts, crackcpu, crack, app, css, html,
       cyLib, dagreLib, cyDagreLib] = await Promise.all([
  read("build/librxe-single.js"),
  read("web/i18n.js"), read("web/patterns.js"), read("web/engine.js"),
  read("web/sandbox.js"), read("web/sha256.js"), read("web/dicts.js"),
  read("web/crackcpu.js"), read("web/crack.js"),
  read("web/app.js"), read("web/style.css"), read("web/index.html"),
  // The Tree tab's drawing libraries. Served, they load from web/vendor on
  // demand; here there is no fetching a neighbour file, so they are inlined --
  // once, up front, since a file:// page cannot pull them in later. They are
  // UMD, so a plain <script> leaves cytoscape/dagre on window, exactly as the
  // on-demand loader expects to find them.
  read("web/vendor/cytoscape.min.js"), read("web/vendor/dagre.min.js"),
  read("web/vendor/cytoscape-dagre.js")
]);

// The transport the bundle substitutes: the same calls, answered here.
const direct = `
var __rxeReady = null, __rxeFatal = null, __rxeEngine = null;
globalThis.__rxeTransport = function () {
  return {
    call: (type, args) => Promise.resolve(
      __rxeEngine && __rxeEngine[type] ? __rxeEngine[type](args || {})
                                       : { error: "not ready" }),
    ready: (fn) => { __rxeReady = fn; },
    fatal: (fn) => { __rxeFatal = fn; }
  };
};
`;

const boot = `
createLibrxe().then(function (Module) {
  __rxeEngine = makeEngine(Module, { makeTransform: makeTransform });
  if (__rxeReady) __rxeReady();
}).catch(function (e) { if (__rxeFatal) __rxeFatal(String(e)); });
`;

// The page, minus the things that only make sense when served.
//
// Every replacement goes in through a function rather than a string, because
// a replacement string treats $& and $' and $$ as instructions: passing the
// Emscripten output in directly corrupted the inlined WebAssembly, which then
// failed to compile with a data section running past the end of the module.
const body = html
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="module" src="app\.js"><\/script>/, () =>
    `<script>\n${libSingle}\n</script>\n` +
    `<script>\n${cyLib}\n</script>\n` +
    `<script>\n${dagreLib}\n</script>\n` +
    `<script>\n${cyDagreLib}\n</script>\n` +
    `<script>\n${direct}\n${demodule(sha)}\n${demodule(sandbox)}\n` +
    `${demodule(dicts)}\n${demodule(i18n)}\n${demodule(patterns)}\n` +
    `${demodule(engine)}\n${demodule(crackcpu)}\n${demodule(crack)}\n${demodule(app)}\n${boot}\n</script>`)
  .replace(/<title>[^<]*<\/title>/, () => "<title>rxenum</title>");

await mkdir(root + "dist", { recursive: true });
await writeFile(root + "dist/rxenum.html", body);

const kb = Math.round(Buffer.byteLength(body) / 1024);
console.log(`bundle: dist/rxenum.html, ${kb} KB, opens from file://`);
