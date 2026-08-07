# jsrxe - librxe in the browser
#
# Two artefacts out of one source tree, neither of which reimplements
# anything:
#
#   bin/rxenum.js    the whole demo program compiled to wasm, run under node.
#                    Output-identical to the native rxenum by construction,
#                    which is the point: bin/rxenum-wasm wraps it so that
#                    librxe's own test suite runs against this build with
#                    RXENUM=../jsrxe/bin/rxenum-wasm make test
#
#   web/librxe.js    the library only, with a small binding layer, for the UI.
#                    No option parsing, no output formatting -- the UI drives
#                    rxe_parse/rxe_seek/rxe_current itself.
#
# GMP is built from source for wasm because there is no packaged one. It is
# the library's only dependency.

RXE      ?= ../rxe
GMP_VER  ?= 6.3.0
GMP_URL  ?= https://ftp.gnu.org/gnu/gmp/gmp-$(GMP_VER).tar.xz
BUILD    ?= build
GMP      := $(BUILD)/gmp
GMP_LIB  := $(GMP)/.libs/libgmp.a

# The library's sources, minus its demo program, plus ours.
RXE_SRC  := $(RXE)/rxe.c $(RXE)/rxe_alt.c $(RXE)/rxe_node.c $(RXE)/parse.c \
            $(RXE)/bkreftbl.c $(RXE)/permute.c $(RXE)/repeat.c $(RXE)/pair.c \
            $(RXE)/lens.c $(RXE)/dict.c

EMCC     ?= emcc
# Always the full path, never bare 'node': sourcing emsdk_env.sh puts $(EMSDK)
# on PATH, and there is a directory called 'node' there that shadows the
# binary, so a bare 'node' fails with "Permission denied". Version 22 or later
# is wanted anyway, for the global WebSocket the DevTools protocol needs, and
# Emscripten ships one.
NODE     ?= $(firstword $(wildcard $(EMSDK)/node/*/bin/node) /usr/bin/node node)
CFLAGS   := -O2 -I$(RXE) -I$(GMP)

# Asyncify and threads are deliberately absent: every entry point returns
# promptly, and the UI keeps the module in a worker instead.
# The default 64KB stack is not enough. print_grouped sizes a variable-length
# array from the number of decimal digits it is about to write, and the whole
# point of this library is numbers with a great many of them: the cardinality
# of '[a-z]{1,20000}' has 28,300, which overflows the stack and traps.
COMMON   := -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=8MB -sMODULARIZE=1

all: bin/rxenum.js web/librxe.js

# ---- GMP for wasm ---------------------------------------------------------
# --disable-assembly because the hand-written assembly is per-architecture and
# there is none for wasm; --host=none makes configure stop guessing.

$(BUILD)/gmp-$(GMP_VER).tar.xz:
	mkdir -p $(BUILD)
	curl -L -o $@ $(GMP_URL)

$(GMP)/configure: $(BUILD)/gmp-$(GMP_VER).tar.xz
	cd $(BUILD) && tar xf gmp-$(GMP_VER).tar.xz && rm -rf gmp && mv gmp-$(GMP_VER) gmp
	touch $@

$(GMP_LIB): $(GMP)/configure
	cd $(GMP) && emconfigure ./configure \
	    --disable-assembly --host=none --disable-shared --enable-static
	cd $(GMP) && emmake make -j

gmp: $(GMP_LIB)

# ---- the demo program, for running librxe's own test suite ----------------

# NODERAWFS gives the program the real filesystem rather than Emscripten's
# in-memory one, so 'rxenum -D dir [:name:]' can read a name.dict file exactly
# as the native build does -- without it the dictionary tests would fail
# against this build for want of the files, not for any fault in the library.
bin/rxenum.js: $(RXE_SRC) $(RXE)/rxenum.c $(GMP_LIB)
	$(EMCC) $(CFLAGS) -O2 -I$(RXE) -Ibuild/gmp -sALLOW_MEMORY_GROWTH=1 \
	    -sSTACK_SIZE=8MB -sINVOKE_RUN=1 -sEXIT_RUNTIME=1 -sENVIRONMENT=node \
	    -sNODERAWFS=1 \
	    $(RXE_SRC) $(RXE)/rxenum.c $(GMP_LIB) -lm -o $@

# ---- the library, for the UI ---------------------------------------------

# EXPORT_ES6 so the worker can be a module worker and import it, and so the
# same file is importable from node for the headless test below. The heap
# views have to be asked for by name: recent Emscripten does not put them on
# the module object unless told, and reading an element's bytes needs them.
LIBFLAGS := -sEXPORT_NAME=createLibrxe -sEXPORT_ES6=1 \
            -sEXPORTED_FUNCTIONS=_malloc,_free \
            -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString,HEAPU8,HEAP32

web/librxe.js: $(RXE_SRC) src/binding.c $(GMP_LIB)
	$(EMCC) $(CFLAGS) $(COMMON) $(LIBFLAGS) -sENVIRONMENT=web,worker \
	    $(RXE_SRC) src/binding.c $(GMP_LIB) -lm -o $@

# The same binding built for node, so that engine.js can be exercised without
# a browser. Not shipped; it exists to be tested.
build/librxe-node.mjs: $(RXE_SRC) src/binding.c $(GMP_LIB)
	$(EMCC) $(CFLAGS) $(COMMON) $(LIBFLAGS) -sENVIRONMENT=node \
	    $(RXE_SRC) src/binding.c $(GMP_LIB) -lm -o $@

# And once more with the WebAssembly inlined as base64 and no ES module, for
# the single-file build: a page opened from file:// may not fetch a .wasm nor
# import a module, so both have to be gone.
build/librxe-single.js: $(RXE_SRC) src/binding.c $(GMP_LIB)
	$(EMCC) $(CFLAGS) -O2 -I$(RXE) -Ibuild/gmp -sALLOW_MEMORY_GROWTH=1 \
	    -sSTACK_SIZE=8MB -sSINGLE_FILE=1 -sMODULARIZE=1 \
	    -sEXPORT_NAME=createLibrxe -sEXPORTED_FUNCTIONS=_malloc,_free \
	    -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString,HEAPU8,HEAP32 \
	    -sENVIRONMENT=web \
	    $(RXE_SRC) src/binding.c $(GMP_LIB) -lm -o $@

# One file, no server. See tools/bundle.mjs for why that costs the worker.
bundle: build/librxe-single.js
	$(NODE) tools/bundle.mjs

# ---- checks ---------------------------------------------------------------
# The real test of the port: librxe's suite, unchanged, against this build.

test: bin/rxenum.js build/librxe-node.mjs web/librxe.js bundle
	cd $(RXE) && RXENUM=$(CURDIR)/bin/rxenum-wasm $(MAKE) test
	$(NODE) tests/node.mjs
	$(NODE) tests/browser.mjs

serve: web/librxe.js
	@echo "http://localhost:8000/web/"
	python3 -m http.server 8000

clean:
	rm -f bin/rxenum.js bin/rxenum.wasm web/librxe.js web/librxe.wasm \
	      build/librxe-node.mjs build/librxe-node.wasm \
	      build/librxe-single.js dist/rxenum.html

distclean: clean
	rm -rf $(BUILD)

.PHONY: all gmp bundle test serve clean distclean
