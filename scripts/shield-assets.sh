#!/bin/sh
# Writes the browser prover's files to public/shield/ (gitignored): the zkey split into parts of at most 24 MiB
# (Workers assets cap a file at 25 MiB), the witness wasm, the verification key, and manifest.json with a sha256
# per file. Run before `bun run dev` or `bun run deploy`:
#   SHIELD_BUILD=<dir with transact_final.zkey and transact_js/> sh scripts/shield-assets.sh
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
BUILD=${SHIELD_BUILD:-$ROOT/shield/circuits/build}
ZKEY=$BUILD/transact_final.zkey
WASM=$BUILD/transact_js/transact.wasm
VK=$ROOT/shield/circuits/build/verification_key.json
PIN=$(cut -d' ' -f1 "$ROOT/shield/circuits/build/transact_final.zkey.sha256")
OUT=$ROOT/public/shield
PART=$((24 * 1024 * 1024))

for f in "$ZKEY" "$WASM" "$VK"; do
  [ -f "$f" ] || { echo "missing $f (set SHIELD_BUILD)" >&2; exit 1; }
done

if command -v sha256sum >/dev/null 2>&1; then sha() { sha256sum "$1" | cut -d' ' -f1; }; else sha() { shasum -a 256 "$1" | cut -d' ' -f1; }; fi
size() { wc -c < "$1" | tr -d ' '; }
entry() { printf '{ "file": "%s", "size": %s, "sha256": "%s" }' "$(basename "$1")" "$(size "$1")" "$(sha "$1")"; }

ZSHA=$(sha "$ZKEY")
[ "$ZSHA" = "$PIN" ] || { echo "zkey sha256 $ZSHA does not match shield/circuits/build/transact_final.zkey.sha256 ($PIN)" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT"
split -b "$PART" -a 2 "$ZKEY" "$OUT/transact.zkey."
cp "$WASM" "$OUT/transact.wasm"
cp "$VK" "$OUT/verification_key.json"

CHUNKS=""
for c in "$OUT"/transact.zkey.*; do
  CHUNKS="$CHUNKS${CHUNKS:+,
    }$(entry "$c")"
done

cat > "$OUT/manifest.json" <<EOF
{
  "version": 1,
  "zkey": {
    "sha256": "$ZSHA",
    "size": $(size "$ZKEY"),
    "chunks": [
    $CHUNKS
    ]
  },
  "wasm": $(entry "$OUT/transact.wasm"),
  "vk": $(entry "$OUT/verification_key.json")
}
EOF

echo "wrote $OUT: $(ls "$OUT" | wc -l | tr -d ' ') files"
