pragma circom 2.2.2;

// Unlinked Shield: 2-in-2-out join-split (spec 2026-11-21-unlinked-shield-design.md, section 6).
// Public signals, in order: [S0, H].

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/sha256/sha256.circom";
include "templates/merkle.circom";
include "templates/payload.circom";

template Transact() {
    var TREE_DEPTH = 20;
    var NULL_DEPTH = 40;
    var TWO64 = 18446744073709551616;
    // Z1 = Poseidon(0, 0): an empty pair slot at level 1.
    var Z1 = 14744269619966411208579211824598458697587494354926760081771325075741142829156;

    signal input S0;
    signal input H;

    signal input Rc;
    signal input n;
    signal input Rn;

    signal input shieldSk;

    // Input notes. amount 0 = dummy: no membership, no nullifier insertion, published N = 0.
    signal input inAmount[2];
    signal input inBlinding[2];
    signal input inLeafIndex[2];
    signal input inPath[2][TREE_DEPTH];
    // Nullifier SMT siblings; the second path is taken against the root after the first insertion.
    signal input nullPath[2][NULL_DEPTH];

    signal input outAmount[2];
    signal input outPk[2];
    signal input outBlinding[2];

    // Siblings of the level-1 pair slot n/2 (levels 1..19).
    signal input appendPath[TREE_DEPTH - 1];
    // i64 as its u64 two's-complement value.
    signal input publicAmount;
    // sha256(extData), 32 bytes.
    signal input extDataHash[32];

    // ---- State: S0 = Poseidon(Rc, n, Rn)
    component s0 = Poseidon(3);
    s0.inputs <== [Rc, n, Rn];
    s0.out === S0;

    component pkOf = Poseidon(1);
    pkOf.inputs[0] <== shieldSk;

    component inRange[2];
    component inZero[2];
    component inC[2];
    component idxBits[2];
    component member[2];
    component nf[2];
    component nBytes[2];
    component nKey[2];
    component smtOld[2];
    component smtNew[2];
    signal isReal[2];
    signal N[2];
    signal rn[3];
    rn[0] <== Rn;

    for (var i = 0; i < 2; i++) {
        inRange[i] = Num2Bits(64);
        inRange[i].in <== inAmount[i];
        inZero[i] = IsZero();
        inZero[i].in <== inAmount[i];
        isReal[i] <== 1 - inZero[i].out;

        inC[i] = Poseidon(3);
        inC[i].inputs <== [inAmount[i], pkOf.out, inBlinding[i]];

        idxBits[i] = Num2Bits(TREE_DEPTH);
        idxBits[i].in <== inLeafIndex[i];
        member[i] = MerkleRoot(TREE_DEPTH);
        member[i].leaf <== inC[i].out;
        member[i].bits <== idxBits[i].out;
        member[i].siblings <== inPath[i];
        isReal[i] * (member[i].root - Rc) === 0;

        nf[i] = Poseidon(3);
        nf[i].inputs <== [shieldSk, inC[i].out, inLeafIndex[i]];
        N[i] <== isReal[i] * nf[i].out;

        // Canonical bytes of N (payload) and its low 40 bits (SMT slot), from one strict decomposition.
        nBytes[i] = FieldBytesBE();
        nBytes[i].in <== N[i];

        smtOld[i] = MerkleRoot(NULL_DEPTH);
        smtNew[i] = MerkleRoot(NULL_DEPTH);
        smtOld[i].leaf <== 0;
        smtNew[i].leaf <== N[i];
        for (var k = 0; k < NULL_DEPTH; k++) {
            // bit k (LSB first) of N is byte-string bit 255 - k
            smtOld[i].bits[k] <== nBytes[i].out[255 - k];
            smtNew[i].bits[k] <== nBytes[i].out[255 - k];
        }
        smtOld[i].siblings <== nullPath[i];
        smtNew[i].siblings <== nullPath[i];
        isReal[i] * (smtOld[i].root - rn[i]) === 0;
        rn[i + 1] <== rn[i] + isReal[i] * (smtNew[i].root - rn[i]);
    }

    component outRange[2];
    component outC[2];
    for (var j = 0; j < 2; j++) {
        outRange[j] = Num2Bits(64);
        outRange[j].in <== outAmount[j];
        outC[j] = Poseidon(3);
        outC[j].inputs <== [outAmount[j], outPk[j], outBlinding[j]];
    }

    // ---- Balance. Every term is below 2^65 in absolute value, so the field equation is an integer one.
    component pa = Num2Bits(64);
    pa.in <== publicAmount;
    signal pubVal <== publicAmount - pa.out[63] * TWO64;
    inAmount[0] + inAmount[1] + pubVal === outAmount[0] + outAmount[1];

    // ---- Append: n even, n + 2 <= 2^20, slot n/2 at level 1 is Z1 under Rc.
    signal m <-- n \ 2;
    n === 2 * m;
    component mBits = Num2Bits(TREE_DEPTH - 1);
    mBits.in <== m;

    component appOld = MerkleRoot(TREE_DEPTH - 1);
    appOld.leaf <== Z1;
    appOld.bits <== mBits.out;
    appOld.siblings <== appendPath;
    appOld.root === Rc;

    component pair = Poseidon(2);
    pair.inputs <== [outC[0].out, outC[1].out];
    component appNew = MerkleRoot(TREE_DEPTH - 1);
    appNew.leaf <== pair.out;
    appNew.bits <== mBits.out;
    appNew.siblings <== appendPath;

    // ---- New state: S1 = Poseidon(Rc', n + 2, Rn')
    component s1 = Poseidon(3);
    s1.inputs <== [appNew.root, n + 2, rn[2]];

    // ---- Binding: payload (200 B) = S1 | publicAmount i64 | C'0 | C'1 | N0 | N1 | extDataHash
    component s1Bytes = FieldBytesBE();
    s1Bytes.in <== s1.out;
    component c0Bytes = FieldBytesBE();
    c0Bytes.in <== outC[0].out;
    component c1Bytes = FieldBytesBE();
    c1Bytes.in <== outC[1].out;
    component paBE = BitsBE(64);
    paBE.lsbFirst <== pa.out;
    component edBits[32];

    component sha = Sha256(1600);
    for (var k = 0; k < 256; k++) {
        sha.in[k] <== s1Bytes.out[k];
        sha.in[320 + k] <== c0Bytes.out[k];
        sha.in[576 + k] <== c1Bytes.out[k];
        sha.in[832 + k] <== nBytes[0].out[k];
        sha.in[1088 + k] <== nBytes[1].out[k];
    }
    for (var k = 0; k < 64; k++) {
        sha.in[256 + k] <== paBE.out[k];
    }
    for (var b = 0; b < 32; b++) {
        edBits[b] = Num2Bits(8);
        edBits[b].in <== extDataHash[b];
        for (var k = 0; k < 8; k++) {
            sha.in[1344 + 8 * b + k] <== edBits[b].out[7 - k];
        }
    }

    // H = sha256(payload) with the top 3 bits cleared, big-endian.
    component hNum = Bits2Num(253);
    for (var i = 0; i < 253; i++) {
        hNum.in[i] <== sha.out[255 - i];
    }
    hNum.out === H;
}

component main {public [S0, H]} = Transact();
