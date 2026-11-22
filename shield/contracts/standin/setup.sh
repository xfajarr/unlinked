#!/bin/sh
# TEST ONLY key for the free-statement stand-in circuit. Never deploy it.
# usage: sh setup.sh <circom binary> <ptau>   (CP1: zk-cp1/tools/bin/circom, zk-cp1/ptau/ppot_0080_12.ptau)
set -e
cd "$(dirname "$0")"
CIRCOM=$1; PTAU=$2; B=build; S="node node_modules/snarkjs/build/cli.cjs"
mkdir -p $B
$CIRCOM free_statement.circom --r1cs --wasm --sym -o $B
$S groth16 setup $B/free_statement.r1cs $PTAU $B/fs_0000.zkey > $B/setup.log
$S zkey contribute $B/fs_0000.zkey $B/fs_0001.zkey --name="standin test contributor" -e="$(openssl rand -hex 32)" > $B/contribute.log
$S zkey beacon $B/fs_0001.zkey $B/fs_final.zkey 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f 10 -n="standin beacon" > $B/beacon.log
$S zkey verify $B/free_statement.r1cs $PTAU $B/fs_final.zkey > $B/zkey-verify.log
tail -1 $B/zkey-verify.log
$S zkey export verificationkey $B/fs_final.zkey $B/verification_key.json
rm -f $B/fs_0000.zkey $B/fs_0001.zkey
echo standin setup done
