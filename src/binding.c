/*
 * jsrxe - a JavaScript binding for librxe
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * http://www.gnu.org/licenses/gpl-2.0.html for details.
 *
 */

// The surface the user interface talks to.
//
// Only two things need saying about the design. Indices cross the boundary as
// decimal strings rather than numbers, because they routinely exceed what a
// double can hold without rounding -- the whole point of the library is that
// '[0-9A-Za-z]{8}' has 218,340,105,584,896 members and each one has an exact
// address -- and a decimal string round-trips through JavaScript's BigInt
// exactly. And every string this hands back is freshly allocated, with
// rxe_js_free to release it, rather than living in a static buffer: the
// interface is meant to be usable from more than one place at a time.
//
// There is deliberately no option parsing and no output formatting here. That
// belongs to rxenum, which is compiled separately and whole, so that the test
// suite has something to check this build against.

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>
#include "rxe.h"
#include "lens.h"
#include "rxe_graph.h"
#include "rxe_lay.h"
#include "policy.h"

/* ------------------------------------------------------------------------ */

// The longest element this will render. Unlike rxenum's limit this is not a
// stack buffer, so it can afford to be generous; the caller sees a truncated
// string rather than a wrong one only past this.

#define JS_MAXSTRLEN            65536

EMSCRIPTEN_KEEPALIVE
struct rxe *rxe_js_parse(const char *pattern, int flags)
{
    return rxe_parse(pattern,flags);
}

EMSCRIPTEN_KEEPALIVE
void rxe_js_free(void *p)
{
    free(p);
}

EMSCRIPTEN_KEEPALIVE
void rxe_js_release(struct rxe *rxe)
{
    if (rxe) rxe_free(rxe);
}

EMSCRIPTEN_KEEPALIVE
int rxe_js_error(struct rxe *rxe)
{
    return (int)rxe_error(rxe);
}

// Freshly allocated; the caller releases it with rxe_js_free.

EMSCRIPTEN_KEEPALIVE
char *rxe_js_error_message(struct rxe *rxe)
{
    const char *msg = rxe_error_message(rxe);
    char *out = malloc(strlen(msg)+1);
    if (out) strcpy(out,msg);
    return out;
}

// Where a parse error was found, as a byte offset into the pattern; the page
// points a caret at it. Only meaningful when rxe_js_error is non-zero.

EMSCRIPTEN_KEEPALIVE
int rxe_js_error_pos(struct rxe *rxe)
{
    return rxe_error_pos(rxe);
}

EMSCRIPTEN_KEEPALIVE
int rxe_js_is_infinite(struct rxe *rxe)
{
    return rxe_is_infinite(rxe);
}

EMSCRIPTEN_KEEPALIVE
int rxe_js_is_shortlex(struct rxe *rxe)
{
    return rxe_is_shortlex(rxe);
}

// The number of members, as a decimal string, or NULL when there is no such
// number. Note that an infinite expression's nitems counts only the finite
// part of it and is not the size of anything the caller wants to know about,
// which is why this refuses rather than reporting it.

EMSCRIPTEN_KEEPALIVE
char *rxe_js_count(struct rxe *rxe)
{
    if (!rxe || rxe_is_infinite(rxe)) return NULL;
    return mpz_get_str(NULL,10,rxe->nitems);
}

// How many members are exactly this long. Meaningful for every expression,
// finite or not, and the thing a cardinality cannot say.

EMSCRIPTEN_KEEPALIVE
char *rxe_js_count_at_length(struct rxe *rxe, int len)
{
    mpz_t c;
    char *out;
    if (!rxe) return NULL;
    mpz_init(c);
    rxe_count_at_length(c,rxe,len);
    out = mpz_get_str(NULL,10,c);
    mpz_clear(c);
    return out;
}

// Move to the element at 'index', given in decimal. Returns 0 on success and
// non-zero when the index is past the end -- which cannot happen for an
// infinite expression, there being no end to be past.

EMSCRIPTEN_KEEPALIVE
int rxe_js_seek(struct rxe *rxe, const char *index)
{
    mpz_t pos;
    int rc;
    if (!rxe || !index) return 1;
    mpz_init(pos);
    if (mpz_set_str(pos,index,10)) { mpz_clear(pos); return 1; }
    rc = rxe_seek(rxe,pos);
    mpz_clear(pos);
    return rc;
}

EMSCRIPTEN_KEEPALIVE
int rxe_js_next(struct rxe *rxe)
{
    return rxe_next(rxe) ? 1 : 0;
}

/* -------------------------------- Rank ---------------------------------- */

// The inverse of seek: given a string, the index (or indices) at which it sits
// in the set. The Search tab uses this. The string is passed as a pointer and
// a length rather than a C string, because a member can hold any byte value --
// including zero -- and the page hands over exactly the bytes it is showing.

// Every index a string is reached by, newline-separated, up to 'max' of them.
// Freshly allocated; release with rxe_js_free. Empty string when the string is
// no member; NULL when the set is one rank cannot handle -- ask the reason.
struct rank_collect { char *buf; size_t len, cap; int n, max; };
static int rank_collect_cb(const mpz_t idx, void *v)
{
    struct rank_collect *c = v;
    char *s = mpz_get_str(NULL, 10, idx);
    size_t sl = strlen(s);
    if (c->len + sl + 2 > c->cap) {
        c->cap = (c->len + sl + 2) * 2;
        c->buf = realloc(c->buf, c->cap);
    }
    if (c->n) c->buf[c->len++] = '\n';
    memcpy(c->buf + c->len, s, sl);
    c->len += sl;
    free(s);
    return ++c->n >= c->max;               // stop once the cap is reached
}

EMSCRIPTEN_KEEPALIVE
char *rxe_js_rank_all(struct rxe *rxe, const char *s, int len, int max)
{
    char *tmp = malloc(len + 1);
    if (!tmp) return NULL;
    memcpy(tmp, s, len);
    tmp[len] = 0;
    struct rank_collect c = { malloc(16), 0, 16, 0, max > 0 ? max : 1 };
    if (!c.buf) { free(tmp); return NULL; }
    long rc = rxe_rank_all(rxe, tmp, rank_collect_cb, &c);
    free(tmp);
    if (rc < 0) { free(c.buf); return NULL; }   // refused
    c.buf[c.len] = 0;
    return c.buf;
}

// How many indices the string is reached by, as a decimal string. "0" for a
// non-member; NULL when the set cannot be ranked. A value above one is a
// duplicate. This is cheap and exact even when the count is astronomical, so
// the page learns whether a listing was capped without building it.
EMSCRIPTEN_KEEPALIVE
char *rxe_js_rank_count(struct rxe *rxe, const char *s, int len)
{
    char *tmp = malloc(len + 1);
    if (!tmp) return NULL;
    memcpy(tmp, s, len);
    tmp[len] = 0;
    mpz_t c;
    mpz_init(c);
    int rc = rxe_rank_count(rxe, tmp, c);
    free(tmp);
    if (rc < 0) { mpz_clear(c); return NULL; }
    char *out = mpz_get_str(NULL, 10, c);
    mpz_clear(c);
    return out;
}

// Why a set could not be ranked, when rxe_js_rank_all/count returned NULL.
// Freshly allocated; release with rxe_js_free.
EMSCRIPTEN_KEEPALIVE
char *rxe_js_rank_reason(void)
{
    const char *msg = rxe_rank_reason();
    char *out = malloc(strlen(msg) + 1);
    if (out) strcpy(out, msg);
    return out;
}

// The element currently selected. Freshly allocated; release with
// rxe_js_free. Members can hold any byte value including zero, so the length
// is reported separately rather than left to a terminator.

EMSCRIPTEN_KEEPALIVE
char *rxe_js_current(struct rxe *rxe, int *len_out)
{
    // Render up to the byte cap the page has set, rather than a fixed buffer,
    // so a member longer than the page wants to show is trimmed here and the
    // overflow latch is raised. One byte past the cap is built so a member
    // that only just exceeds it is caught rather than passing as an exact fit.
    size_t lim = rxe_max_member ? rxe_max_member : (size_t)JS_MAXSTRLEN;
    char *buf = malloc(lim + 2);
    char *end;
    int len;
    if (!buf) return NULL;
    end = rxe_current(buf,(int)(lim + 1),rxe);
    len = (int)(end - buf);
    if (len > (int)lim) { rxe_member_overflow = 1; len = (int)lim; buf[len] = 0; }
    if (len_out) *len_out = len;
    return buf;
}

// The page sets the per-member byte cap to suit the DOM, far below the
// library's file-sized default. Zero lifts it.

EMSCRIPTEN_KEEPALIVE
void rxe_js_set_max_member(int bytes)
{
    rxe_set_max_member(bytes < 0 ? 0 : (size_t)bytes);
}

// Non-zero when a member since the last check was refused or trimmed for
// exceeding the cap. Reads and clears, so the page checks once per rendered
// page and learns whether any row came back short.

EMSCRIPTEN_KEEPALIVE
int rxe_js_check_overflow(void)
{
    return rxe_check_overflow();
}

/* ------------------------------ Parse tree ------------------------------ */

// The parse tree as JSON, for the Tree tab. The library's rxe_graph_walk is the
// one traversal rxedot draws with; here the same walk builds a JSON object
// { nodes: [...], edges: [...] } that Cytoscape renders in the browser. Nothing
// about the drawing lives in the library, only the shape of the tree.

// A string that grows as it is appended to. Doubling keeps the whole build
// linear; a failed realloc leaves cap at zero and every further append a no-op,
// so the caller checks buf once at the end rather than at every step.
struct jbuf { char *buf; size_t len, cap; };
static void jput(struct jbuf *b, const char *s, size_t n)
{
    if (b->len + n + 1 > b->cap) {
        size_t want = (b->len + n + 1) * 2;
        char *p = realloc(b->buf, want);
        if (!p) { free(b->buf); b->buf = NULL; b->cap = 0; return; }
        b->buf = p; b->cap = want;
    }
    if (!b->buf) return;
    memcpy(b->buf + b->len, s, n);
    b->len += n;
    b->buf[b->len] = 0;
}
static void jputs(struct jbuf *b, const char *s) { if (s) jput(b, s, strlen(s)); }
static void jputi(struct jbuf *b, int v)
{
    char t[16];
    jput(b, t, snprintf(t, sizeof t, "%d", v));
}
// A 64-bit unsigned as a bare JSON number. Values past 2^53 lose precision as a
// JS number, so the crack tab reads the big ones (segment offsets, the total) as
// BigInt(String(...)); a decimal literal round-trips through that exactly.
static void jputu64(struct jbuf *b, unsigned long long v)
{
    char t[24];
    jput(b, t, snprintf(t, sizeof t, "%llu", v));
}
// A JSON string literal: the quotes, and the escapes JSON insists on inside.
static void jputq(struct jbuf *b, const char *s)
{
    jput(b, "\"", 1);
    for (; s && *s; s++) {
        unsigned char c = *s;
        if      (c == '"')  jput(b, "\\\"", 2);
        else if (c == '\\') jput(b, "\\\\", 2);
        else if (c == '\n') jput(b, "\\n", 2);
        else if (c == '\r') jput(b, "\\r", 2);
        else if (c == '\t') jput(b, "\\t", 2);
        else if (c < 32)    { char u[8]; jput(b, u, snprintf(u, sizeof u, "\\u%04x", c)); }
        else jput(b, (char *)&c, 1);
    }
    jput(b, "\"", 1);
}
// A member that may be absent: the JSON string, or the literal null.
static void jputopt(struct jbuf *b, const char *s)
{
    if (s) jputq(b, s); else jputs(b, "null");
}

static const char *gkind_name(enum rxe_gkind k)
{
    switch (k) {
        case RXE_G_ROOT:       return "root";
        case RXE_G_LEAF:       return "leaf";
        case RXE_G_LITERAL:    return "literal";
        case RXE_G_GROUP:      return "group";
        case RXE_G_ALT:        return "alt";
        case RXE_G_REPEAT:     return "repeat";
        case RXE_G_COMB:       return "comb";
        case RXE_G_SHUFFLE:    return "shuffle";
        case RXE_G_DICT:       return "dict";
        case RXE_G_SUBROUTINE: return "subroutine";
        case RXE_G_BACKREF:    return "backref";
    }
    return "leaf";
}

// The two arrays are built side by side and joined at the end, since the walk
// hands nodes and edges over interleaved. nn/ne carry the comma state.
struct jgraph { struct jbuf nodes, edges; int nn, ne; };

static void jg_node(void *cx, const struct rxe_gnode_ev *n)
{
    struct jgraph *g = cx;
    struct jbuf *b = &g->nodes;
    if (g->nn++) jput(b, ",", 1);
    jputs(b, "{\"id\":");       jputi(b, n->id);
    jputs(b, ",\"kind\":");     jputq(b, gkind_name(n->kind));
    jputs(b, ",\"line1\":");    jputq(b, n->line1);
    jputs(b, ",\"card\":");     jputq(b, n->card);
    jputs(b, ",\"cardExact\":");jputq(b, n->card_exact ? n->card_exact : "");
    jputs(b, ",\"inf\":");      jputs(b, n->is_inf ? "true" : "false");
    jputs(b, ",\"place\":");    jputopt(b, n->place);
    jputs(b, ",\"placeExact\":");jputopt(b, n->place_exact);
    jputs(b, ",\"choices\":");  jputopt(b, n->choices);
    jputs(b, ",\"text\":");     jputopt(b, n->text);
    jputs(b, ",\"onPath\":");   jputs(b, n->on_path ? "true" : "false");
    jputs(b, ",\"refTo\":");    jputi(b, n->ref_to);
    if (n->kind == RXE_G_REPEAT || n->kind == RXE_G_COMB) {
        jputs(b, ",\"repMin\":"); jputi(b, n->rep_min);
        jputs(b, ",\"repMax\":"); jputi(b, n->rep_max);
    }
    if (n->kind == RXE_G_COMB) {
        jputs(b, ",\"perm\":"); jputs(b, n->comb_perm ? "true" : "false");
    }
    jput(b, "}", 1);
}

static void jg_alt(void *cx, const struct rxe_galt_ev *a)
{
    struct jgraph *g = cx;
    struct jbuf *b = &g->nodes;
    if (g->nn++) jput(b, ",", 1);
    jputs(b, "{\"id\":");     jputi(b, a->id);
    jputs(b, ",\"kind\":\"alt\",\"onPath\":");
    jputs(b, a->on_path ? "true" : "false");
    jputs(b, ",\"subs\":[");
    for (int k = 0; k < a->nsub; k++) {
        if (k) jput(b, ",", 1);
        jputs(b, "{\"start\":");     jputq(b, a->subs[k].start);
        jputs(b, ",\"card\":");      jputq(b, a->subs[k].card);
        jputs(b, ",\"startExact\":");jputq(b, a->subs[k].start_exact ? a->subs[k].start_exact : "");
        jputs(b, ",\"cardExact\":"); jputq(b, a->subs[k].card_exact ? a->subs[k].card_exact : "");
        jputs(b, ",\"inf\":");       jputs(b, a->subs[k].is_inf ? "true" : "false");
        jput(b, "}", 1);
    }
    jputs(b, "]}");
}

static void jg_edge(void *cx, const struct rxe_gedge_ev *e)
{
    struct jgraph *g = cx;
    struct jbuf *b = &g->edges;
    if (g->ne++) jput(b, ",", 1);
    jputs(b, "{\"from\":");     jputi(b, e->from);
    jputs(b, ",\"fromPort\":"); jputi(b, e->from_port);
    jputs(b, ",\"to\":");       jputi(b, e->to);
    jputs(b, ",\"onPath\":");   jputs(b, e->on_path ? "true" : "false");
    jputs(b, ",\"isRef\":");    jputs(b, e->is_ref ? "true" : "false");
    jputs(b, ",\"label\":");    jputopt(b, e->label);
    jput(b, "}", 1);
}

// The tree of 'rxe' as JSON. collapse/unroll/fold match rxedot's -c/-u/-w; a
// non-empty 'path' is a decimal index that is seeked to first, so the returned
// graph lights the route to that member (its nodes' onPath set). Freshly
// allocated; release with rxe_js_free. NULL only on allocation failure.
EMSCRIPTEN_KEEPALIVE
char *rxe_js_graph(struct rxe *rxe, int collapse, int unroll, int fold,
                   const char *path)
{
    if (!rxe) return NULL;
    int onpath = 0;
    if (path && path[0]) {
        mpz_t idx;
        mpz_init(idx);
        if (mpz_set_str(idx, path, 10) == 0 && mpz_sgn(idx) >= 0
                && rxe_seek(rxe, idx) == 0)
            onpath = 1;
        mpz_clear(idx);
    }
    struct jgraph g = { { NULL, 0, 0 }, { NULL, 0, 0 }, 0, 0 };
    // letters on: words fold to one node but keep their letters as hidden
    // children, so a click unfolds 'cat' into 'c' 'a' 't'. alt_reverse on: an
    // alternation's branches draw right-to-left by index, so a lit path reads in
    // written order.
    struct rxe_graph_opts opts = { .collapse = collapse, .unroll = unroll,
                                   .fold = fold, .on_path = onpath,
                                   .letters = 1, .alt_reverse = 1 };
    struct rxe_graph_visitor vis = { jg_node, jg_alt, jg_edge };
    rxe_graph_walk(rxe, &opts, &vis, &g);

    struct jbuf out = { NULL, 0, 0 };
    jputs(&out, "{\"nodes\":[");
    if (g.nodes.buf) jput(&out, g.nodes.buf, g.nodes.len);
    jputs(&out, "],\"edges\":[");
    if (g.edges.buf) jput(&out, g.edges.buf, g.edges.len);
    jputs(&out, "]}");
    free(g.nodes.buf);
    free(g.edges.buf);
    return out.buf;
}

/* ------------------------------ Wheel plan ------------------------------ */

// The odometer the WebGPU crack tab lays candidates from. rxe_lay (the same
// wheels rxejit compiles to C/OpenCL) decomposes the set; here they are
// serialised so crack.js can JIT a WGSL kernel that generates candidates on the
// GPU. The library owns the decomposition; nothing about WGSL lives here.

// One wheel as JSON: its alternatives' bytes laid flat, with n and the fixed
// width L. L==0 is a variable-width wheel, and then off[i]/len[i] slice the i-th
// alternative out of bytes; L>0 (a char class is L==1) means alternative i is
// bytes[i*L .. i*L+L], the fast case the GPU odometer wants.
static void jput_wheel(struct jbuf *b, const struct wheel *w)
{
    int blen = w->L ? w->n * w->L
                    : (w->n ? w->aoff[w->n - 1] + w->alen[w->n - 1] : 0);
    jputs(b, "{\"n\":");  jputi(b, w->n);
    jputs(b, ",\"L\":");  jputi(b, w->L);
    jputs(b, ",\"bytes\":[");
    for (int i = 0; i < blen; i++) { if (i) jput(b, ",", 1); jputi(b, (unsigned char)w->base[i]); }
    jput(b, "]", 1);
    if (!w->L) {
        jputs(b, ",\"off\":[");
        for (int i = 0; i < w->n; i++) { if (i) jput(b, ",", 1); jputi(b, w->aoff[i]); }
        jputs(b, "],\"len\":[");
        for (int i = 0; i < w->n; i++) { if (i) jput(b, ",", 1); jputi(b, w->alen[i]); }
        jput(b, "]", 1);
    }
    jput(b, "}", 1);
}

// The pattern's odometer as JSON, or { ok:false, reason } for a set no odometer
// can express (an infinite repeat, an alternation too large to unroll) -- the
// same declines rxe_lay names. The plan also carries the two super-wheels (a
// large variable-count repeat, a combinatorial {{...}} choice) so the hybrid
// path can host-enumerate them; the fast path uses them only to bail. Freshly
// allocated; release with rxe_js_free. NULL only on allocation failure.
EMSCRIPTEN_KEEPALIVE
char *rxe_js_wheel_plan(struct rxe *rxe)
{
    struct jbuf out = { NULL, 0, 0 };
    if (!rxe) return NULL;

    struct build b;
    if (rxe_lay_build(&b, rxe) < 0) {
        jputs(&out, "{\"ok\":false,\"reason\":");
        jputq(&out, rxe_lay_reason());
        jput(&out, "}", 1);
        return out.buf;
    }

    jputs(&out, "{\"ok\":true,\"nw\":");  jputi(&out, b.nw);
    jputs(&out, ",\"hasBackref\":");      jputs(&out, b.has_backref ? "true" : "false");
    jputs(&out, ",\"wheels\":[");
    for (int i = 0; i < b.nw; i++) { if (i) jput(&out, ",", 1); jput_wheel(&out, &b.w[i]); }
    jput(&out, "]", 1);

    jputs(&out, ",\"lr\":{\"active\":");  jputs(&out, b.lr_active ? "true" : "false");
    if (b.lr_active) {
        jputs(&out, ",\"at\":"); jputi(&out, b.lr_at);
        jputs(&out, ",\"a\":");  jputi(&out, b.lr_a);
        jputs(&out, ",\"b\":");  jputi(&out, b.lr_b);
        jputs(&out, ",\"sw\":[");
        for (int i = 0; i < b.lr_nsw; i++) { if (i) jput(&out, ",", 1); jput_wheel(&out, &b.lr_sw[i]); }
        jput(&out, "]", 1);
    }
    jput(&out, "}", 1);

    jputs(&out, ",\"perm\":{\"active\":"); jputs(&out, b.perm_active ? "true" : "false");
    if (b.perm_active) {
        jputs(&out, ",\"at\":");      jputi(&out, b.perm_at);
        jputs(&out, ",\"lo\":");      jputi(&out, b.perm_lo);
        jputs(&out, ",\"hi\":");      jputi(&out, b.perm_hi);
        jputs(&out, ",\"ordered\":"); jputs(&out, b.perm_ordered ? "true" : "false");
        jputs(&out, ",\"chop\":");    jputi(&out, b.perm_chop);
        jputs(&out, ",\"pool\":");    jput_wheel(&out, &b.perm_pool);
    }
    jput(&out, "}", 1);

    // A policy composition (A|B|...){{lo,hi!floors}}: the shape, plus the segment
    // table (one (length, count-vector) block, in minimal-compliance-first order,
    // with the cumulative offset) that the WGSL kernel binary-searches an index
    // into. Built by the library's rxe_policy_segments, the same order rxejit's
    // OpenCL bakes, so the browser and the native cracker agree. Too large for a
    // 64-bit index (or the bake cap) sets big:true, and the crack tab declines to
    // the interpreter oracle.
    jputs(&out, ",\"policy\":{\"active\":"); jputs(&out, b.policy_active ? "true" : "false");
    if (b.policy_active) {
        int k = b.policy_k, cap = 8192;
        jputs(&out, ",\"at\":");     jputi(&out, b.policy_at);
        jputs(&out, ",\"lo\":");     jputi(&out, b.policy_lo);
        jputs(&out, ",\"hi\":");     jputi(&out, b.policy_hi);
        jputs(&out, ",\"k\":");      jputi(&out, k);
        jputs(&out, ",\"soaker\":"); jputi(&out, b.policy_soaker);
        jputs(&out, ",\"floors\":[");
        for (int i = 0; i < k; i++) { if (i) jput(&out, ",", 1); jputi(&out, b.policy_floor[i]); }
        jputs(&out, "],\"s\":[");
        for (int i = 0; i < k; i++) { if (i) jput(&out, ",", 1); jputu64(&out, b.policy_s[i]); }
        jputs(&out, "],\"cstart\":[");
        for (int i = 0; i < k; i++) { if (i) jput(&out, ",", 1); jputu64(&out, b.policy_cstart[i]); }
        jputs(&out, "],\"pool\":");   jput_wheel(&out, &b.policy_pool);

        int *segL = malloc((size_t)(cap + 1) * sizeof *segL);
        int *segCV = malloc((size_t)(cap + 1) * (size_t)k * sizeof *segCV);
        unsigned long long *segOFF = malloc((size_t)(cap + 1) * sizeof *segOFF);
        const char *why = NULL;
        int nseg = (segL && segCV && segOFF)
            ? rxe_policy_segments(b.policy_s, k, b.policy_lo, b.policy_hi,
                                  b.policy_floor, b.policy_soaker, cap, segL, segCV, segOFF, &why)
            : -1;
        if (nseg < 0) {
            jputs(&out, ",\"big\":true");
        } else {
            jputs(&out, ",\"nseg\":");  jputi(&out, nseg);
            jputs(&out, ",\"npol\":");  jputu64(&out, segOFF[nseg]);
            jputs(&out, ",\"segOff\":[");
            for (int i = 0; i <= nseg; i++) { if (i) jput(&out, ",", 1); jputu64(&out, segOFF[i]); }
            jputs(&out, "],\"segL\":[");
            for (int i = 0; i < nseg; i++) { if (i) jput(&out, ",", 1); jputi(&out, segL[i]); }
            jputs(&out, "],\"segCV\":[");
            for (int i = 0; i < nseg * k; i++) { if (i) jput(&out, ",", 1); jputi(&out, segCV[i]); }
            jput(&out, "]", 1);
        }
        free(segL); free(segCV); free(segOFF);
    }
    jput(&out, "}", 1);

    jput(&out, "}", 1);
    rxe_lay_free(&b);
    return out.buf;
}

/* ---------------------------- Dictionaries ------------------------------ */

// Register a word dictionary from JavaScript. The words arrive as one string
// with newline separators, since an array of strings does not cross the wasm
// boundary as cleanly; they are split here into the array rxe_register_dict
// wants, which copies them, so the split is torn down immediately after.
// [:name:] in a pattern then draws from them. The browser registers its
// built-ins and whatever the user has added this way, there being no
// filesystem for the library to read a name.dict from.

EMSCRIPTEN_KEEPALIVE
void rxe_js_register_dict(const char *name, const char *joined)
{
    size_t len, cap = 16, n = 0;
    char *buf, *tok, *save;
    const char **words;
    if (!name || !joined) return;
    len = strlen(joined);
    buf = malloc(len + 1);
    memcpy(buf, joined, len + 1);
    words = malloc(cap * sizeof(char *));
    // strtok folds runs of newlines together, so blank lines and a trailing
    // one drop out rather than becoming empty words.
    for (tok = strtok_r(buf, "\n", &save); tok; tok = strtok_r(NULL, "\n", &save)) {
        if (n == cap) { cap *= 2; words = realloc(words, cap * sizeof(char *)); }
        words[n++] = tok;
    }
    rxe_register_dict(name, words, (int)n);
    free(words);
    free(buf);
}

// Drop every registered dictionary. Used before re-registering the whole set
// when one is removed, so a deleted dictionary stops resolving.
EMSCRIPTEN_KEEPALIVE
void rxe_js_free_dicts(void)
{
    rxe_free_dicts();
}

/* ------------------------- Keyed permutation ---------------------------- */

EMSCRIPTEN_KEEPALIVE
struct rxe_permutation *rxe_js_permutation_new(const char *domain,
                                               const char *key)
{
    mpz_t d;
    struct rxe_permutation *perm;
    if (!domain || !key) return NULL;
    mpz_init(d);
    if (mpz_set_str(d,domain,10)) { mpz_clear(d); return NULL; }
    perm = rxe_permutation_new(d,key);
    mpz_clear(d);
    return perm;
}

EMSCRIPTEN_KEEPALIVE
void rxe_js_permutation_release(struct rxe_permutation *perm)
{
    rxe_permutation_free(perm);
}

EMSCRIPTEN_KEEPALIVE
char *rxe_js_permutation_map(struct rxe_permutation *perm, const char *index)
{
    mpz_t i,o;
    char *out;
    if (!index) return NULL;
    mpz_init(i);
    mpz_init(o);
    if (mpz_set_str(i,index,10)) { mpz_clear(i); mpz_clear(o); return NULL; }
    rxe_permutation_map(o,perm,i);
    out = mpz_get_str(NULL,10,o);
    mpz_clear(i);
    mpz_clear(o);
    return out;
}

// The inverse: given a natural set index, the position the key shows it at. The
// Search tab uses it to place a found member's index in the shuffled view, so a
// search lands on the right row whether or not a key is set.
EMSCRIPTEN_KEEPALIVE
char *rxe_js_permutation_unmap(struct rxe_permutation *perm, const char *image)
{
    mpz_t i,o;
    char *out;
    if (!image) return NULL;
    mpz_init(i);
    mpz_init(o);
    if (mpz_set_str(i,image,10)) { mpz_clear(i); mpz_clear(o); return NULL; }
    rxe_permutation_unmap(o,perm,i);
    out = mpz_get_str(NULL,10,o);
    mpz_clear(i);
    mpz_clear(o);
    return out;
}
