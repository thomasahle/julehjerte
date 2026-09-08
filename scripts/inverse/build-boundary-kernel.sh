#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Use an LLVM build with the wasm32 target. Apple Clang does not provide it.
"${WASM_CLANG:-clang}" --target=wasm32 -O3 -fno-builtin -ffp-contract=off \
  -nostdlib -Wl,--no-entry -Wl,--export=boundary_gradient \
  -Wl,--export=__heap_base -Wl,--export-memory -Wl,--initial-memory=1048576 \
  -o static/inverse/core/direct/native/boundary.wasm \
  static/inverse/core/direct/native/boundary.c
