// Runs web/selftest.html in a real browser and reports what it found.
//
// tests/node.mjs already checks the answers the binding gives; what this adds
// is the part that only exists in a browser -- that the module worker starts,
// that the WebAssembly instantiates inside it, and that messages cross between
// the page and the worker intact.
//
// It has to be driven over the DevTools protocol rather than with
// --dump-dom, because Chrome's --virtual-time-budget does not advance timers
// inside a worker: the worker starts and then waits forever for a setTimeout
// that never fires, so a page that looks broken under --dump-dom may be
// perfectly well. Real time, and a real wait, is the only honest way to check.
//
// Needs a node with a global WebSocket, which is node 22 or later. Emscripten
// ships one; the Makefile points at it.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = fileURLToPath(new URL("../web/", import.meta.url));
const PORT = 8731;
const CDP_PORT = 9711;

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json"
};

/* ------------------------------------------------------------------ server */

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split("?")[0]))
                 .replace(/^(\.\.[/\\])+/, "");
  const file = join(WEB, path === "/" ? "index.html" : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

/* ----------------------------------------------------------------- browser */

function findChrome() {
  for (const c of ["google-chrome", "chromium", "chromium-browser"]) return c;
}

const chrome = spawn(findChrome(), [
  "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`,
  "--user-data-dir=" + join(process.env.TMPDIR || "/tmp", "jsrxe-cdp-" + process.pid),
  "about:blank"
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetUrl() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not listening yet */ }
    await sleep(100);
  }
  throw new Error("the browser never opened a debugging port");
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const waiting = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const w = waiting.get(msg.id);
      if (w) { waiting.delete(msg.id); w(msg); }
    };
    ws.onerror = reject;
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res) => {
        const n = ++id;
        waiting.set(n, res);
        ws.send(JSON.stringify({ id: n, method, params }));
      }),
      close: () => ws.close()
    });
  });
}

/* -------------------------------------------------------------------- run */

let code = 0;
try {
  const cdp = await connect(await targetUrl());
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/selftest.html` });

  let result = null;
  for (let i = 0; i < 200; i++) {          // up to twenty seconds of real time
    await sleep(100);
    const r = await cdp.send("Runtime.evaluate", {
      expression: "JSON.stringify(globalThis.__selftest || null)",
      returnByValue: true
    });
    const v = r.result?.result?.value;
    if (v && v !== "null") { result = JSON.parse(v); break; }
  }
  // And the application itself: it must reach the library, count a set and
  // put rows on the page without being touched.
  let app = null;
  if (result && !result.fail) {
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });
    for (let i = 0; i < 200; i++) {
      await sleep(100);
      const r = await cdp.send("Runtime.evaluate", {
        expression: `JSON.stringify({
          count: document.getElementById("count")?.textContent || "",
          order: document.getElementById("orderlabel")?.textContent || "",
          rows: document.querySelectorAll("#results tbody tr").length,
          first: document.querySelector("#results tbody td.val")?.textContent || "",
          examples: document.querySelectorAll("#liblist li").length,
          err: document.getElementById("err")?.hidden === false
                 ? document.getElementById("err").textContent : ""
        })`,
        returnByValue: true
      });
      const v = JSON.parse(r.result?.result?.value || "null");
      if (v && v.rows > 0) { app = v; break; }
      if (v && v.err) { app = v; break; }
    }
  }

  // The tutorial on-ramp: "start here" jumps to the first tutorial step and
  // switches the filter to it.
  let onboard = null;
  if (app && !app.err) {
    await cdp.send("Runtime.evaluate", {
      expression: `document.getElementById("ob-new").click()`
    });
    for (let i = 0; i < 60; i++) {
      await sleep(100);
      const r = await cdp.send("Runtime.evaluate", {
        expression: `JSON.stringify({
          pattern: document.getElementById("pattern")?.value || "",
          count: document.getElementById("count")?.textContent || "",
          active: document.querySelector("#libtabs .subtab.on")?.dataset.filter || ""
        })`,
        returnByValue: true
      });
      const v = JSON.parse(r.result?.result?.value || "null");
      if (v && v.pattern === "a") { onboard = v; break; }
    }
  }

  // The Tree tab: opening it loads Cytoscape from web/vendor on demand and
  // mounts a canvas -- the whole graph pipeline, end to end in a real browser.
  // The pattern here is the tutorial's "a", left by the onboard step above.
  let tree = null;
  if (app && !app.err) {
    await cdp.send("Runtime.evaluate", { expression:
      `document.querySelector('.etab[data-etab="tree"]').click()` });
    for (let i = 0; i < 100; i++) {
      await sleep(100);
      const r = await cdp.send("Runtime.evaluate", {
        expression: `JSON.stringify({
          canvas: document.querySelectorAll("#cy canvas").length,
          msg: document.getElementById("treemsg").classList.contains("show")
        })`, returnByValue: true });
      const v = JSON.parse(r.result?.result?.value || "null");
      if (v && v.canvas > 0) { tree = v; break; }
    }
    await cdp.send("Runtime.evaluate", { expression:
      `document.querySelector('.etab[data-etab="elements"]').click()` });
    await sleep(200);
  }

  // Share: the state encodes into the URL hash and restores on reload. The
  // secondary piece checked here is the Search tab's query -- the shuffle key
  // it used to check moved out of the UI into example state.
  let share = null;
  if (app && !app.err) {
    await cdp.send("Runtime.evaluate", { expression: `(function(){
      const p = document.getElementById("pattern");
      p.value = "[a-c]{2}"; p.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('.etab[data-etab="search"]').click();
    })()` });
    await sleep(500);
    await cdp.send("Runtime.evaluate", { expression: `(function(){
      const f = document.getElementById("findtext");
      f.value = "abc"; f.dispatchEvent(new Event("input", { bubbles: true }));
    })()` });
    await sleep(500);
    await cdp.send("Runtime.evaluate", { expression: `document.getElementById("share2").click()` });
    await sleep(200);
    const u = await cdp.send("Runtime.evaluate", { expression: `location.href`, returnByValue: true });
    const url = u.result?.result?.value || "";
    if (url.includes("#s=")) {
      await cdp.send("Page.navigate", { url });
      for (let i = 0; i < 100; i++) {
        await sleep(100);
        const r = await cdp.send("Runtime.evaluate", {
          expression: `JSON.stringify({ p: document.getElementById("pattern").value,
                                        q: document.getElementById("findtext").value })`,
          returnByValue: true
        });
        const v = JSON.parse(r.result?.result?.value || "null");
        if (v && v.p) { share = v; break; }
      }
    }
  }

  // And the single-file build, from a file:// URL, which is the whole reason
  // it exists: no server, no worker, no fetch of a .wasm.
  let bundle = null;
  const dist = fileURLToPath(new URL("../dist/rxenum.html", import.meta.url));
  if (app && existsSync(dist)) {
    await cdp.send("Page.navigate", { url: "file://" + dist });
    for (let i = 0; i < 200; i++) {
      await sleep(100);
      const r = await cdp.send("Runtime.evaluate", {
        expression: `JSON.stringify({
          count: document.getElementById("count")?.textContent || "",
          rows: document.querySelectorAll("#results tbody tr").length,
          first: document.querySelector("#results tbody td.val")?.textContent || "",
          err: document.getElementById("err")?.hidden === false
                 ? document.getElementById("err").textContent : ""
        })`,
        returnByValue: true
      });
      const v = JSON.parse(r.result?.result?.value || "null");
      if (v && (v.rows > 0 || v.err)) { bundle = v; break; }
    }
  }

  // Type '[\d]' into the freshly loaded bundle and confirm the class shorthand
  // reads as the ten digits, not the letter 'd' -- the whole worker/wasm path
  // end to end, from a file:// URL.
  let shorthand = null;
  if (bundle && !bundle.err) {
    await cdp.send("Runtime.evaluate", { expression: `(() => {
      const p = document.getElementById("pattern");
      p.value = "[\\\\d]";
      p.dispatchEvent(new Event("input", { bubbles: true }));
    })()` });
    for (let i = 0; i < 100; i++) {
      await sleep(100);
      const r = await cdp.send("Runtime.evaluate", {
        expression: `JSON.stringify({
          count: document.getElementById("count")?.textContent || "",
          vals: Array.from(document.querySelectorAll("#results tbody td.val"))
                  .map((td) => td.textContent).join("")
        })`,
        returnByValue: true
      });
      const v = JSON.parse(r.result?.result?.value || "null");
      if (v && v.count === "10") { shorthand = v; break; }
    }
  }

  cdp.close();

  if (shorthand) {
    const ok = shorthand.count === "10" && shorthand.vals === "0123456789";
    console.log(ok ? "shorthand: [\\d] reads as the ten digits in the browser"
                   : "shorthand: FAILED " + JSON.stringify(shorthand));
    if (!ok) code = 1;
  } else if (bundle && !bundle.err) {
    console.log("shorthand: [\\d] never resolved in the bundle");
    code = 1;
  }

  if (onboard) {
    const ok = onboard.pattern === "a" && onboard.count === "1" &&
               onboard.active === "tutorial";
    console.log(ok ? "onboard: 'start here' opens the tutorial's first step"
                   : "onboard: FAILED " + JSON.stringify(onboard));
    if (!ok) code = 1;
  } else if (app && !app.err) {
    console.log("onboard: 'start here' never opened the tutorial");
    code = 1;
  }

  if (tree) {
    const ok = tree.canvas > 0 && !tree.msg;
    console.log(ok ? "tree: the parse tree renders on a Cytoscape canvas"
                   : "tree: FAILED " + JSON.stringify(tree));
    if (!ok) code = 1;
  } else if (app && !app.err) {
    console.log("tree: the Tree tab never rendered");
    code = 1;
  }

  if (share) {
    const ok = share.p === "[a-c]{2}" && share.q === "abc";
    console.log(ok ? "share: the view round-trips through the URL"
                   : "share: FAILED " + JSON.stringify(share));
    if (!ok) code = 1;
  } else if (app && !app.err) {
    console.log("share: state never round-tripped through the URL");
    code = 1;
  }

  if (bundle) {
    const ok = !bundle.err && bundle.count === "218,340,105,584,896" &&
               bundle.rows > 0 && bundle.first === "00000000";
    console.log(ok ? "bundle: dist/rxenum.html works from a file:// URL"
                   : "bundle: FAILED " + JSON.stringify(bundle));
    if (!ok) code = 1;
  } else if (app && existsSync(dist)) {
    // The bundle never rendered a row at all -- a load-time throw, such as a
    // module reading another's const before the concatenation defines it. A
    // silent skip here once shipped exactly that, so treat it as a failure.
    console.log("bundle: FAILED -- dist/rxenum.html rendered no rows (load-time error?)");
    code = 1;
  }

  if (app) {
    const want = "218,340,105,584,896";
    const ok = !app.err && app.count === want && app.rows > 0 &&
               app.first === "00000000" && app.examples > 10;
    console.log(ok
      ? `app: loads, counts ${app.count}, ${app.examples} examples, ` +
        `first element ${app.first}`
      : `app: FAILED ${JSON.stringify(app)}`);
    if (!ok) code = 1;
  } else if (result && !result.fail) {
    console.log("app: the page never rendered any rows");
    code = 1;
  }

  if (!result) {
    console.log("browser: the page never reported a result");
    code = 1;
  } else if (result.fail) {
    for (const f of result.failures) console.log("FAIL  " + f);
    console.log(`\nbrowser: ${result.fail} FAILED, ${result.pass} passed`);
    code = 1;
  } else {
    console.log(`browser: all ${result.pass} checks passed in a real browser`);
  }
} catch (e) {
  console.log("browser: " + (e && e.message ? e.message : e));
  code = 1;
} finally {
  chrome.kill();
  server.close();
}
process.exit(code);
