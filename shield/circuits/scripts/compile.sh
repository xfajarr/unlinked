#!/bin/sh
# Compile transact.circom with --O2 into $SHIELD_BUILD (default: build/, gitignored apart from the vk and zkey hash).
set -eu
cd "$(dirname "$0")/.."
OUT=${SHIELD_BUILD:-build}
CIRCOM=${CIRCOM:-circom}
mkdir -p "$OUT"
"$CIRCOM" transact.circom --O2 --r1cs --wasm --sym -l node_modules -o "$OUT"
npx snarkjs r1cs info "$OUT/transact.r1cs"
