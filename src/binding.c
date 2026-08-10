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

#include <stdlib.h>
#include <string.h>
#include <emscripten.h>
#include "rxe.h"
#include "lens.h"

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
