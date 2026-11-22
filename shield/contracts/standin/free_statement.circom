pragma circom 2.2.2;

// TEST ONLY. NEVER DEPLOY. This circuit proves nothing: every (s0, h) pair is provable.
// It stands in for shield/circuits/transact.circom so the pool contract can be tested with real
// Groth16 proofs for any statement [S0, H] (spec section 6) before the real circuit exists.
template FreeStatement() {
    signal input s0;
    signal input h;

    signal s0sq;
    signal hsq;
    s0sq <== s0 * s0;
    hsq <== h * h;
}

component main {public [s0, h]} = FreeStatement();
