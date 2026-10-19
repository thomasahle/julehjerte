#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Use an LLVM build with the wasm32 target. Apple Clang does not provide it.
"${WASM_CLANG:-clang}" --target=wasm32 -O3 -fno-builtin -fno-fast-math -ffp-contract=off \
  -nostdlib -Wl,--no-entry -Wl,--export=boundary_gradient \
  -Wl,--export=distance_transform -Wl,--export=label_core -Wl,--export=label_core_diagonal \
  -Wl,--export=grid_rows -Wl,--export=grid_mask -Wl,--export=grid_loss -Wl,--export=paper_masks \
  -Wl,--export=__heap_base -Wl,--export-memory -Wl,--initial-memory=1048576 \
  -o static/inverse/core/direct/native/boundary.wasm \
  static/inverse/core/direct/native/boundary.c
chmod 644 static/inverse/core/direct/native/boundary.wasm
