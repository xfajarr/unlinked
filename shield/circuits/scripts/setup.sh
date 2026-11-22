#!/bin/sh
# Groth16 phase 2 for transact: setup on PSE ppot_0080_18, one contribution (fresh local entropy,
# not printed, not kept), a beacon, zkey verify, vk export. Usage: setup.sh <beacon-hex>
set -eu
cd "$(dirname "$0")/.."
OUT=${SHIELD_BUILD:-build}
PTAU=${PTAU:-$OUT/ptau/ppot_0080_18.ptau}
BEACON=$1
S="node --max-old-space-size=8192 node_modules/snarkjs/build/cli.cjs"
t() { date +%s; }
T0=$(t)
$S groth16 setup "$OUT/transact.r1cs" "$PTAU" "$OUT/transact_0000.zkey" > "$OUT/setup.log" 2>&1
T1=$(t); echo "groth16 setup: $((T1-T0)) s"
$S zkey contribute "$OUT/transact_0000.zkey" "$OUT/transact_0001.zkey" --name="unlinked shield contributor 1" -e="$(openssl rand -hex 64)" > "$OUT/contribute.log" 2>&1
T2=$(t); echo "contribute: $((T2-T1)) s"
rm -f "$OUT/transact_0000.zkey"
$S zkey beacon "$OUT/transact_0001.zkey" "$OUT/transact_final.zkey" "$BEACON" 10 -n="unlinked shield beacon" > "$OUT/beacon.log" 2>&1
T3=$(t); echo "beacon: $((T3-T2)) s"
rm -f "$OUT/transact_0001.zkey"
$S zkey verify "$OUT/transact.r1cs" "$PTAU" "$OUT/transact_final.zkey" > "$OUT/zkey-verify.log" 2>&1
T4=$(t); echo "zkey verify: $((T4-T3)) s"; tail -1 "$OUT/zkey-verify.log"
$S zkey export verificationkey "$OUT/transact_final.zkey" "$OUT/verification_key.json"
cp "$OUT/verification_key.json" build/verification_key.json
shasum -a 256 "$OUT/transact_final.zkey" | sed "s|  .*/|  |" > build/transact_final.zkey.sha256
ls -l "$OUT/transact_final.zkey"
echo "total: $(( $(t) - T0 )) s"
