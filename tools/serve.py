#!/usr/bin/env python3
# Local development server for jsrxe.
#
# The only reason it exists rather than `python3 -m http.server` is the
# Cache-Control header below. Without it the browser is free to cache the
# .wasm heuristically, so a freshly rebuilt library can keep behaving like the
# old one on a plain reload -- which is exactly the trap a `make serve` session
# fell into. Production (GitHub Pages) sets its own headers and cache-busts the
# .wasm by checksum; this is only for the local loop.

import http.server
import socketserver

PORT = 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.allow_reuse_address = True
    print(f"serving on http://localhost:{PORT}/web/  (no-store; Ctrl-C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print()
