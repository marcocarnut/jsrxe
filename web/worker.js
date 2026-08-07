// The library lives here rather than on the page's thread.
//
// Every call returns promptly, but "promptly" is not the same as "free": a
// seek deep into a set of 10^28000 elements does real arithmetic, and a page
// of a thousand elements does it a thousand times. Keeping it off the main
// thread is what stops the scrolling juddering.
//
// A module worker rather than a classic one, so that librxe.js can be an ES
// module and the same engine.js runs here and under node.

import createLibrxe from "./librxe.js";
import { makeEngine } from "./engine.js";

let engine = null;

self.onmessage = (ev) => {
  const { id, type, ...args } = ev.data;
  const reply = (payload) => self.postMessage({ id, ...payload });
  if (!engine) { reply({ error: "not ready" }); return; }
  try {
    reply(engine[type] ? engine[type](args) : { error: "unknown request: " + type });
  } catch (e) {
    reply({ error: String(e && e.message ? e.message : e) });
  }
};

// Without the catch this would be an unhandled rejection inside the worker,
// which the page never sees: it would simply wait for a 'ready' that never
// came, with nothing to say why.
createLibrxe()
  .then((Module) => { engine = makeEngine(Module); self.postMessage({ ready: true }); })
  .catch((e) => self.postMessage({ fatal: String(e && e.stack ? e.stack : e) }));
