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

// The element currently selected. Freshly allocated; release with
// rxe_js_free. Members can hold any byte value including zero, so the length
// is reported separately rather than left to a terminator.

EMSCRIPTEN_KEEPALIVE
char *rxe_js_current(struct rxe *rxe, int *len_out)
{
    char *buf = malloc(JS_MAXSTRLEN+1);
    char *end;
    if (!buf) return NULL;
    end = rxe_current(buf,JS_MAXSTRLEN,rxe);
    if (len_out) *len_out = (int)(end - buf);
    return buf;
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
