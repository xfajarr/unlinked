pragma circom 2.2.2;

include "circomlib/circuits/bitify.circom";

// A field element as 32 big-endian bytes, 256 bits MSB first. Strict decomposition, so the
// encoding is canonical (< r) and the top 2 bits are 0.
template FieldBytesBE() {
    signal input in;
    signal output out[256];

    component b = Num2Bits_strict();
    b.in <== in;
    out[0] <== 0;
    out[1] <== 0;
    for (var k = 2; k < 256; k++) {
        out[k] <== b.out[255 - k];
    }
}

// The low `n` bits of an LSB-first bit array, MSB first (big-endian).
template BitsBE(n) {
    signal input lsbFirst[n];
    signal output out[n];
    for (var k = 0; k < n; k++) {
        out[k] <== lsbFirst[n - 1 - k];
    }
}
