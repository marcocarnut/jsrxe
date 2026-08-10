# Tree tab — design note (survives compaction)

Status: **BUILT** (Aug 2026). The Tree tab shipped across four commits:
`rxe_graph_walk` in librxe with rxedot as its DOT backend (golden-guarded),
the `rxe_js_graph` JSON binding, the Cytoscape tab itself, and word-unfold +
path highlighting. What follows is the design note it was built from, kept for
reference; where the build diverged from it is noted inline. The chief
divergence: the traversal is a **visitor** (`rxe_graph_walk` driving
node/alt/edge callbacks), not a flat `rxe_graph` struct — a visitor keeps the
DOT byte-identical for free and serves the JSON binding equally well.

## The decision: Cytoscape.js, not Graphviz

Spiked at `spike/tree-spike.html` (open via `make serve` → the dev server
serves the whole tree, so `http://localhost:8000/spike/tree-spike.html`).
Verdict after the spike: **Cytoscape.js + cytoscape-dagre**, not
Graphviz-wasm. Reasons:

- Interactivity is the whole reason to be in a browser: fold/unfold, pan,
  zoom, drag, hover, click-to-highlight — a static Graphviz SVG can't touch it.
- Pure JS, ~700 KB of libs (cytoscape 373 + dagre 284 + cytoscape-dagre 13),
  inlines into the single-file `dist/rxenum.html`. Graphviz-wasm is a 2–3 MB
  second wasm — wrong for the single-file ethos.
- Plays naturally with the seek/rank data we already expose.

Vendored libs live in `spike/vendor/` (untracked scratch). UMD globals:
`window.cytoscapeDagre` (needs `window.dagre` loaded first). The
`cytoscape-expand-collapse` extension was a **dead end** — it only folds
*compound* (parent/child nested-box) nodes, and our tree is edge-linked.

## Spike learnings (bake these into the real build)

1. **Collapse is a custom subtree hide/show over the edge-tree**, ~15 lines
   (`subtree()`/`setCollapsed()`/`toggle()` in the spike). Not the extension.
2. **One fold mechanism does two jobs.** A folded thing just has hidden
   children:
   - a **subroutine/group** folds its expansion to a single node (rxedot `-c`);
   - a **literal word** `cat` folds its letters `c` `a` `t` (rxedot `-w`).
   Both are the same show/hide. The word carries the cardinality; the letters
   carry none. Kiko specifically wanted `cat` → `c` `a` `t`, and it "rings
   intuitive." Words start folded (`collapsedStart`), a `⊕` marks a folded node.
3. **Layout: try LR as well as TB.** Concatenation reads better left→right
   (matches the text). dagre optimizes crossings, not reading order — watch
   that concat positions don't reshuffle; may need to pin sibling order.
4. **Alternations won't look as pretty.** rxedot draws them as Graphviz
   *records* with `start / +size` ports; Cytoscape has no record-ports. Spike
   models them **flat** (a node with edges to branch nodes, each labelled
   `start +size`). Kiko: "won't look as pretty but we'll figure something out."
   Open choice for later: flat vs **compound** (boxed-group) nodes — compound is
   prettier but dagre's compound support is weak. Decide with a second spike if
   it matters.
5. Dashed **back-edge** for a subroutine `(?N)` / backreference `\N` pointing to
   its group reads fine (unbundled-bezier, accent colour).

## Architecture (agreed)

Decouple traversal from rendering. The renderer is the smaller half.

1. **`rxe_graph` in librxe.** Lift rxedot's tree-walk into a library API that
   emits an *abstract* node/edge list (not DOT). `rxedot` is then reduced to
   **just the DOT backend** over that list. One traversal, no drift. This is
   "librxe's clients don't reimplement anything," which is the project's rule.
2. **`rxe_js_graph(rxe)` binding → JSON**, the structure the spike fakes by
   hand. Proposed per-node fields (most already on the tree):
   - `id`, `kind` (leaf/class/literal/concat/alt/repeat/comb/shuffle/sub/backref)
   - `syntax` (top line — from the `src_start/src_end` span we already added)
   - `card` (nitems as a decimal string), `placeValue` (the `×weight`)
   - repeat: `rep_min/rep_max`; comb: size range + perm flag; sub: `refersTo`
   - edges: `{from, to, kind}` where kind is `seq` (tree) or `ref` (subroutine/
     backref back-edge)
   The tree already carries `src_start/src_end` and `refers_to` (added for
   rxedot) and `nitems` everywhere, so the emit is mostly plumbing.
3. **Tree tab** = a third `.etab` beside Elements/Search (the tab bar already
   leaves the slot). Cytoscape renders the JSON; fold/unfold + pan/zoom.

## The payoff feature: path highlighting via seek AND rank

- Seek to an index → light the route each node took (rxedot `-f`).
- **And rank a searched string → light the path to it.** This ties the Tree tab
  back to the Search tab: type a string, see *where in the tree* it lives.
- Likely a binding `rxe_js_tree_path(rxe, index)` (and a string variant that
  ranks first) returning the node ids on the path; JS highlights them.

## rxe_graph API (design nailed — implement this)

A presentation-neutral graph: fields kept **separate** (not pre-joined into a
DOT label) so the browser can style syntax/card/place independently and the DOT
backend concatenates them. Node ids assigned in the **same traversal order**
rxedot's `idc++` uses today, so DOT output stays byte-identical.

```c
// rxe_graph.h
enum rxe_gkind {
  RXE_G_LEAF, RXE_G_CLASS, RXE_G_DICT, RXE_G_LITERAL /*folded word*/,
  RXE_G_GROUP, RXE_G_ALT, RXE_G_REPEAT, RXE_G_COMB, RXE_G_SHUFFLE,
  RXE_G_SUBROUTINE, RXE_G_BACKREF
};
struct rxe_gnode {
  int   id;
  enum  rxe_gkind kind;
  char *syntax;    // top line: the source span, or synthesized ("repeat {2}")
  char *card;      // decimal cardinality, or "" ; is_inf set for ∞
  char *place;     // "×N" place value, or NULL
  char *choices;   // -f rolled-repeat iteration list, or NULL
  int   is_inf, on_path, ref_to;   // ref_to: referenced gnode id, or -1
};
struct rxe_gedge {
  int   from, to, is_ref, on_path;
  char *label;     // alt subsection "start\n+size", else NULL
};
struct rxe_graph {
  struct rxe_gnode *nodes; int nnodes;
  struct rxe_gedge *edges; int nedges;
};
struct rxe_graph_opts { int collapse, unroll, fold; const char *path_index; };
struct rxe_graph *rxe_graph_build(struct rxe *, const struct rxe_graph_opts *);
void rxe_graph_free(struct rxe_graph *);
```

The build is a port of rxedot's `draw_node`/`draw_seq`/`draw_contents`, writing
into these structs instead of `fprintf`. rxedot then becomes: parse →
`rxe_graph_build` → walk `struct rxe_graph`, emitting DOT (records+ports for
alternations, dashed edges for `is_ref`, colour for `on_path`). The alternation
record is a **DOT-rendering choice**: abstractly it is an `RXE_G_ALT` node with
labelled branch edges. The `rxe_js_graph` binding serialises the same struct to
JSON.

### Safety net (already in place)
`rxe/tests/rxedot.sh` golden-checks rxedot over 10 patterns × 7 flag combos (70
outputs in `tests/rxedot-golden/`). Run `sh tests/rxedot.sh` before and after
the refactor — it must stay `70 of 70 match`; `--update` only after an
*intentional*, eyeballed change. This is committed to rxe master.

## Build order

1. `rxe_graph` in librxe + refactor rxedot onto it (keep the CLI + its tests green).
2. `rxe_js_graph` binding → JSON; add `rank.c`-style not needed, this is traversal.
3. Tree tab: Cytoscape + dagre, node labels + cardinality, hover tooltip, LR/TB.
4. Fold/unfold (subroutines + literal words), the spike's mechanism.
5. Path highlight via seek, then via rank.
6. Polish: repeat unroll (rxedot `-u`), the alternation prettiness question.

## Also outstanding (unrelated to the Tree tab)

- **Push + redeploy**: rxe `master` (1.1.0, was ~7 ahead) and jsrxe `master`
  (search tab + earlier caret commit). Kiko pushes via a hardware-wallet SSH
  system; never push for him.
- **rxerank v3b/v3c**: variable-length repeat bodies, and the backref-diagonal
  order — both refuse cleanly by name today, so no rush.
- **Re-add keyed-shuffle examples** using `(?~key:)` — the global shuffle-key
  field was removed from jsrxe; keyed bookmarks (the poker deals) still work
  behind the scenes via `state.key`, but the showcase examples want restoring.

## How to verify anything here later

- rxe: `make rxenum rxerank tests/api && sh tests/run.sh` (456) + `make
  test-asan`; oracles `tests/oracle.py` (104), `tests/rank.py` (111),
  `tests/shortlex.py` (14).
- jsrxe: `source ~/emsdk/emsdk_env.sh` then `make web/librxe.js` / `make bundle`;
  engine testable under node with `instantiateWasm` + `readFileSync` of the wasm.
