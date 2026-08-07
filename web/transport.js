// How the page reaches the library.
//
// Normally through a worker, so that a deep seek cannot jank the scrolling.
// The single-file build has no worker -- a page opened from a file:// URL may
// not start one -- and substitutes a transport that calls the engine directly;
// everything above this line is unaware of the difference.

export function makeWorkerTransport() {
  const worker = new Worker("worker.js", { type: "module" });
  let seq = 0;
  const pending = new Map();
  let onReady = () => {};
  let onFatal = () => {};

  worker.onmessage = (ev) => {
    if (ev.data.fatal) { onFatal(ev.data.fatal); return; }
    if (ev.data.ready) { onReady(); return; }
    const { id, ...rest } = ev.data;
    const resolve = pending.get(id);
    if (resolve) { pending.delete(id); resolve(rest); }
  };

  return {
    call: (type, args = {}) => new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      worker.postMessage({ id, type, ...args });
    }),
    ready: (fn) => { onReady = fn; },
    fatal: (fn) => { onFatal = fn; }
  };
}
