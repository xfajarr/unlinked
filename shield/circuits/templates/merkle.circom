pragma circom 2.2.2;

include "circomlib/circuits/poseidon.circom";

// Root of a binary Poseidon tree from a leaf, its index bits (LSB = leaf level) and the siblings.
// bits[i] = 1 means the running node is the right child at level i. Callers must constrain bits to {0,1}.
template MerkleRoot(depth) {
    signal input leaf;
    signal input bits[depth];
    signal input siblings[depth];
    signal output root;

    signal cur[depth + 1];
    signal left[depth];
    component h[depth];

    cur[0] <== leaf;
    for (var i = 0; i < depth; i++) {
        left[i] <== cur[i] + bits[i] * (siblings[i] - cur[i]);
        h[i] = Poseidon(2);
        h[i].inputs[0] <== left[i];
        h[i].inputs[1] <== cur[i] + siblings[i] - left[i];
        cur[i + 1] <== h[i].out;
    }
    root <== cur[depth];
}
