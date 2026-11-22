// The Groth16 verifier coins of Unlinked Shield: the vendored bn-native-sound (mr-zwets/groth16_cashscript @ 4571af9,
// ISC) rebuilt for a snarkjs key, with one change, the GRAPH hook (PATCH.md):
//   upstream GRAPH: TXINPUTCOUNT == 3, and inputs 0..2 spend this input's locking bytecode
//   pool GRAPH:     inputs 0..2 spend this input's locking bytecode, and input 3 carries the pool's mutable NFT
//                   (UTXOTOKENCATEGORY(3) == category ‖ 0x01). No input count rule: the pool sits at input 3 and a
//                   depositor's funding inputs follow it.
// Everything else (roles, STMT, transcript, binding, the libauth OP_DEFINE patch) is upstream's, unchanged.
//
// One VK per process: sound-si-gls/math.mjs reads BN_VK_FIXTURES when it is first imported.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import * as libauth from '@bitauth/libauth';

export {libauth};
export const VMS = {consensus: libauth.createVirtualMachineBch2026(false), standard: libauth.createVirtualMachineBch2026(true)};
const sha256hex = (b) => createHash('sha256').update(b).digest('hex');
const OP_UTXOTOKENCATEGORY = 0xce;
export const POOL_INPUT = 3;

// STMT words are 32-byte little-endian. Input 2's unlocking starts [push DG 96 B][push STMT 642 B]:
// DG push header 0x4c60 (2 B) + 96, STMT push header 0x4d8202 (3 B), so STMT data starts at byte 101.
export const STMT_OFFSET = 101, N0_OFFSET = STMT_OFFSET + 256, N1_OFFSET = STMT_OFFSET + 288;

export function vkFixturesFromSnarkjs(vkJson) {
  if (vkJson.protocol !== 'groth16' || vkJson.curve !== 'bn128') throw new Error('not a BN254 groth16 key');
  if (vkJson.nPublic !== 2) throw new Error(`the verifier binds exactly 2 public inputs, key has ${vkJson.nPublic}`);
  const g1 = (P) => { assert.equal(P[2], '1'); return {x: P[0], y: P[1]}; };
  const g2 = (P) => { assert.deepEqual(P[2], ['1', '0']); return {x: {c0: P[0][0], c1: P[0][1]}, y: {c0: P[1][0], c1: P[1][1]}}; }; // c0 first (snarkjs JSON order)
  return {vk: {alpha: g1(vkJson.vk_alpha_1), beta: g2(vkJson.vk_beta_2), gamma: g2(vkJson.vk_gamma_2), delta: g2(vkJson.vk_delta_2), ic: vkJson.IC.map(g1)}, fixtures: []};
}
export const proofFromSnarkjs = (pf) => ({
  a: {x: pf.pi_a[0], y: pf.pi_a[1]}, b: {x: {c0: pf.pi_b[0][0], c1: pf.pi_b[0][1]}, y: {c0: pf.pi_b[1][0], c1: pf.pi_b[1][1]}}, c: {x: pf.pi_c[0], y: pf.pi_c[1]},
});

// the pool token as OP_UTXOTOKENCATEGORY pushes it: category in internal byte order (libauth keeps display order and
// reverses), then the mutable capability byte 0x01
export const poolTokenOf = (categoryDisplayHex) => Buffer.concat([Buffer.from(categoryDisplayHex, 'hex').reverse(), Buffer.from([0x01])]);

export const poolGraph = (poolToken) => (s, {IX, NROLES, OP}) => {
  assert.equal(poolToken.length, 33);
  s.emit(IX.INPUTINDEX); s.st.push('ix'); s.op(IX.UTXOBYTECODE, 1, 'mine');
  for (let j = 0; j < NROLES; j++) { s.push(j).op(IX.UTXOBYTECODE, 1, 'u'); (j < NROLES - 1 ? s.pick('mine') : s.roll('mine')); s.op(OP.EQUALVERIFY, 2); }
  s.push(POOL_INPUT).op(OP_UTXOTOKENCATEGORY, 1, 'pt').pushBytes(poolToken, 'k').op(OP.EQUALVERIFY, 2);
};

export async function loadVerifier(fixturesPath) {
  const fx = resolve(fixturesPath);
  if (process.env.BN_VK_FIXTURES && resolve(process.env.BN_VK_FIXTURES) !== fx) throw new Error('one VK per process');
  process.env.BN_VK_FIXTURES = fx;
  const base = new URL('./upstream/chunked/bn254/', import.meta.url);
  const math = await import(new URL('sound-si-gls/math.mjs', base));
  const proto = await import(new URL('bn-native-sound/protocol.mjs', base));
  const script = await import(new URL('bn-native-sound/script.mjs', base));
  const txm = await import(new URL('bn-native-sound/transaction.mjs', base));
  const vkSha = sha256hex(JSON.stringify(math.FIXTURES.vk));

  function build(poolToken) {
    script.setGraph(poolGraph(poolToken));
    try {
      const a = script.buildProgram(), b = script.buildProgram();
      assert.ok(Buffer.from(a.code).equals(Buffer.from(b.code)), 'deterministic build');
      const o2 = a.lay.off[2];
      assert.equal(o2.STMT.data, STMT_OFFSET, 'STMT offset in input 2'); assert.equal(o2.DG.data, 2);
      assert.equal(proto.STMT_LAYOUT.n0, 256); assert.equal(proto.STMT_LAYOUT.n1, 288);
      return a;
    } finally { script.setGraph(null); }
  }
  function buildCached(poolToken, path) {
    if (existsSync(path)) {
      const j = JSON.parse(readFileSync(path, 'utf8'));
      if (j.vkSha === vkSha && j.poolTokenHex === Buffer.from(poolToken).toString('hex')) return fromJson(j);
    }
    const t0 = Date.now(); const prog = build(poolToken);
    const j = {note: 'bn-native-sound + pool GRAPH (verifier/PATCH.md). Generated; do not edit.', vkSha, poolTokenHex: Buffer.from(poolToken).toString('hex'),
      codeBytes: prog.code.length, codeSha256: sha256hex(prog.code), KcodeHex: Buffer.from(prog.Kcode).toString('hex'),
      redeemHex: Buffer.from(prog.R).toString('hex'), lockingHex: Buffer.from(txm.lockingOf(prog)).toString('hex'),
      codePiecesHex: prog.pieces.map((x) => Buffer.from(x).toString('hex')), layout: prog.lay,
      stmt: {offset: STMT_OFFSET, n0: N0_OFFSET, n1: N1_OFFSET, wordOrder: 'little-endian'}, buildMs: Date.now() - t0};
    writeFileSync(path, JSON.stringify(j, null, 1) + '\n');
    return fromJson(j);
  }
  const fromJson = (j) => ({R: Buffer.from(j.redeemHex, 'hex'), pieces: j.codePiecesHex.map((h) => Buffer.from(h, 'hex')), lay: j.layout,
    locking: Buffer.from(j.lockingHex, 'hex'), json: j});

  const core = (snarkProof, publicSignals) => proto.proveCore({proof: proofFromSnarkjs(snarkProof), publicInputs: publicSignals.map(String)});

  // the 3 verifier unlockings, fillers prover-sized INSIDE the real transaction context: ctx(unlockings) must return
  // {transaction, sourceOutputs} with these unlockings at inputs 0..2 (the pool GRAPH needs input 3 present)
  function unlockings(c, prog, ctx, {margin = txm.MARGIN, maxIter = 40} = {}) {
    let fills = [0, 0, 0];
    for (let it = 0; it < maxIter; it++) {
      const {unlockings: U} = txm.unlockingsFor(c, prog, fills);
      const program = ctx(U);
      const runs = U.map((u, i) => { const st = VMS.standard.evaluate({...program, inputIndex: i}); return {opCost: st.metrics.operationCost, budget: (41 + u.length) * 800, length: u.length, error: st.error}; });
      const ok = runs.map((x) => x.opCost <= (1 - margin) * x.budget || x.length >= txm.UNLOCK_CAP - 3);
      if (ok.every(Boolean)) return {unlockings: U, fills, runs};
      const next = runs.map((x, i) => { const base = U[i].length - fills[i] - (fills[i] >= 256 ? 3 : fills[i] >= 76 ? 2 : 1) + 1;
        const need = Math.ceil(x.opCost / ((1 - margin) * 800)) - 41; let f = Math.max(0, need - base);
        f = Math.max(0, need - (base - 1) - (f >= 256 ? 3 : f >= 76 ? 2 : 1));
        return Math.min(f, Math.max(0, txm.UNLOCK_CAP - base - 2)); });
      fills = next.map((f, i) => (ok[i] ? fills[i] : Math.max(f, fills[i] + 1)));
    }
    throw new Error('filler sizing did not converge');
  }
  return {math, proto, script, txm, vkSha, build, buildCached, core, unlockings, unlockingsFor: txm.unlockingsFor};
}
