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
            $(RXE)/lens.c

EMCC     ?= emcc
CFLAGS   := -O2 -I$(RXE) -I$(GMP)

# Asyncify and threads are deliberately absent: every entry point returns
# promptly, and the UI keeps the module in a worker instead.
# The default 64KB stack is not enough. print_grouped sizes a variable-length
# array from the number of decimal digits it is about to write, and the whole
# point of this library is numbers with a great many of them: the cardinality
# of '[a-z]{1,20000}' has 28,300, which overflows the stack and traps.
COMMON   := -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=8MB -sMODULARIZE=1 \
            -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString,stringToUTF8

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

bin/rxenum.js: $(RXE_SRC) $(RXE)/rxenum.c $(GMP_LIB)
	$(EMCC) $(CFLAGS) $(COMMON) -sINVOKE_RUN=1 -sEXIT_RUNTIME=1 \
	    -sENVIRONMENT=node -sMODULARIZE=0 \
	    $(RXE_SRC) $(RXE)/rxenum.c $(GMP_LIB) -lm -o $@

# ---- the library, for the UI ---------------------------------------------

web/librxe.js: $(RXE_SRC) src/binding.c $(GMP_LIB)
	$(EMCC) $(CFLAGS) $(COMMON) -sEXPORT_NAME=createLibrxe \
	    -sENVIRONMENT=web,worker \
	    $(RXE_SRC) src/binding.c $(GMP_LIB) -lm -o $@

# ---- checks ---------------------------------------------------------------
# The real test of the port: librxe's suite, unchanged, against this build.

test: bin/rxenum.js
	cd $(RXE) && RXENUM=$(CURDIR)/bin/rxenum-wasm $(MAKE) test

serve: web/librxe.js
	@echo "http://localhost:8000/web/"
	python3 -m http.server 8000

clean:
	rm -f bin/rxenum.js bin/rxenum.wasm web/librxe.js web/librxe.wasm

distclean: clean
	rm -rf $(BUILD)

.PHONY: all gmp test serve clean distclean
