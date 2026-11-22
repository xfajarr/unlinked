// ShieldPool with the REAL key and the chained fixtures (shield/fixtures/chain.json):
// genesis, deposit, transfer, withdraw with their real Groth16 proofs, plus rejects on real proofs.
// Skips when the fixtures or the key are absent.   node --test test/real-chain.test.mjs   (report: build/real.report.json)
import {test, after} from 'node:test';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import * as h from './harness.mjs';
const {assert, fe, keys, locks, be32, fromBe, bindingHash, decodeExtData, finalize, clonePlan, planTransact, setPoolArgs, prove, nextState, verifyTx, firstFailure, genesisTx, signP2pkh, sha256} = h;

const SHIELD = h.HERE + '../';
const CHAIN = SHIELD + 'fixtures/chain.json', VK = SHIELD + 'circuits/build/verification_key.json';
const ready = existsSync(CHAIN) && existsSync(VK);
const chain = ready ? JSON.parse(readFileSync(CHAIN, 'utf8')) : null;
const GENESIS_TXID = sha256(Buffer.from('unlinked shield real-key test genesis')).toString('hex');
const D = ready ? await h.deployment({vkPath: VK, buildPath: h.HERE + 'build/real.build.json', genesisTxid: GENESIS_TXID, prover: null}) : null;
const report = {key: 'CP2a transact key (shield/circuits/build/verification_key.json)', zkeySha256: chain?.circuit?.zkeySha256, valid: [], rejects: []};
after(() => { if (ready) writeFileSync(h.HERE + 'build/real.report.json', JSON.stringify(report, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 1) + '\n'); });

const hex = (x) => Buffer.from(x, 'hex');
const i64 = (b) => { const u = fromBe(b); return u >= 2n ** 63n ? u - 2n ** 64n : u; };
const MINER_FEE_DEPOSIT = 30000n;
const plans = [], proofs = [], states = [];
test('real key: genesis with S_genesis from the fixtures', {skip: !ready}, () => {
  const funding = {txid: hex(GENESIS_TXID), vout: 0, value: 3_000_000n, lock: locks.alice};
  const G = genesisTx({funding, sGenesis: hex(chain.genesis.S), verifierLock: D.verifierLock, poolValue: BigInt(chain.genesis.poolValue), changeLock: locks.alice, fee: 1000n});
  signP2pkh(G.transaction, G.sourceOutputs, 0, keys.alice);
  const v = verifyTx(G); report.valid.push({label: 'genesis', txBytes: v.txBytes, verdict: v.verdict}); assert.ok(v.accepted, JSON.stringify(v.verdict));
  const txid = h.txidOf(G.transaction); const coin = (i) => ({txid, vout: i, value: G.transaction.outputs[i].valueSatoshis, lock: Buffer.from(G.transaction.outputs[i].lockingBytecode), token: G.transaction.outputs[i].token});
  states.push({pool: coin(0), verifiers: [coin(1), coin(2), coin(3)], alice: coin(4)});
});
for (const [k, name] of ['deposit', 'transfer', 'withdraw'].entries()) {
  test(`real key: ${name} with the fixture's proof`, {skip: !ready}, async () => {
    const s = chain.steps[k]; assert.equal(s.name, name);
    const st = states[k]; const P = s.pieces;
    assert.equal(Buffer.from(st.pool.token.nft.commitment).toString('hex'), s.pre.S0, 'chained state');
    assert.equal(st.pool.value, BigInt(s.pre.poolValue));
    const ext = decodeExtData(hex(P.extData)); const publicAmount = i64(hex(P.publicAmount));
    const t = {S1: hex(P.S1), publicAmount, args: {C0: hex(P.C0), C1: hex(P.C1), N0: hex(P.N0), N1: hex(P.N1)}, extData: hex(P.extData),
      ext: {recipientLock: ext.recipientLock, payout: ext.payout, fee: ext.fee}};
    if (publicAmount > 0n) { t.funding = [{coin: st.alice, priv: keys.alice}]; t.change = {lock: locks.alice, value: st.alice.value - publicAmount - MINER_FEE_DEPOSIT}; }
    const plan = planTransact(D, st, t);
    // the contract's payload and H equal the circuit's, byte for byte
    const B = bindingHash({S1: plan.S1, publicAmount, ...plan.args});
    assert.equal(B.payload.toString('hex'), s.payload); assert.equal(B.H.toString('hex'), s.H); assert.equal(B.h.toString(), s.publicSignals[1]);
    assert.equal(fromBe(hex(s.pre.S0)).toString(), s.publicSignals[0]);
    if (s.payoutOutput) assert.equal(Buffer.from(plan.outputs[1].lock).toString('hex'), s.payoutOutput.lockingBytecode);
    assert.equal(plan.outputs[0].value, BigInt(s.newPoolValue));
    const pr = await prove(D, plan, {given: {proof: s.proof, publicSignals: s.publicSignals}});
    const b = finalize(plan, pr.U);
    const v = verifyTx(b, {metrics: true});
    const fee = b.sourceOutputs.reduce((a, o) => a + o.valueSatoshis, 0n) - b.transaction.outputs.reduce((a, o) => a + o.valueSatoshis, 0n);
    report.valid.push({label: name, txBytes: v.txBytes, minerFee: fee, satPerByte: +(Number(fee) / v.txBytes).toFixed(3), verdict: v.verdict, inputs: v.inputs, fills: pr.fills, ms: pr.ms});
    assert.equal(v.verdict.consensus, true, String(v.verdict.consensus)); assert.equal(v.verdict.standard, true, String(v.verdict.standard));
    plans.push(plan); proofs.push(pr);
    const n = nextState(plan, b.transaction); n.alice = n.extra[0] ?? st.alice; states.push(n);
  });
}
const POOL = 3;
const flip = (b, i = 0) => { const c = Buffer.from(b); c[i] ^= 1; return c; };
const rejects = [
  ['withdraw: extData ct1 byte flipped', 2, (D, p) => setPoolArgs(D, p, {extData: flip(p.args.extData, p.args.extData.length - 1)}), '== hm'],
  ['withdraw: extData recipientLock byte flipped', 2, (D, p) => setPoolArgs(D, p, {extData: flip(p.args.extData, 5)}), 'outputs[1].lockingBytecode == recipientLock'],
  ['withdraw: S1 flipped in output 0', 2, (D, p) => { p.outputs[0].token = {...p.outputs[0].token, nft: {...p.outputs[0].token.nft, commitment: flip(p.S1, 31)}}; }, '== hm'],
  ['withdraw: C\'0 flipped', 2, (D, p) => setPoolArgs(D, p, {C0: flip(p.args.C0, 31)}), '== hm'],
  ['withdraw: N0 flipped', 2, (D, p) => setPoolArgs(D, p, {N0: flip(p.args.N0, 31)}), '== hm'],
  ['withdraw: payout to another lock', 2, (D, p) => { p.outputs[1].lock = locks.thief; }, 'outputs[1].lockingBytecode == recipientLock'],
  ['withdraw: payout 1 sat short', 2, (D, p) => { p.outputs[1].value -= 1n; }, 'outputs[1].value == payout'],
  ['withdraw: pool value + 1', 2, (D, p) => { p.outputs[0].value += 1n; }, '0 - publicAmount == payout + fee'],
  ['transfer: extra output skimming the fee', 1, (D, p) => { p.outputs.push({lock: locks.thief, value: 1000n}); }, 'outputs.length == v + 3'],
  ['deposit: pool gets 1 sat less', 0, (D, p) => { p.outputs[0].value -= 1n; p.outputs.at(-1).value += 1n; }, '== hm'],
];
for (const [label, k, mut, req] of rejects) test('real key reject: ' + label, {skip: !ready}, () => {
  const p = clonePlan(plans[k]); mut(D, p); const b = finalize(p, proofs[k].U);
  const v = verifyTx(b); const f = firstFailure(b, [POOL, 0, 1, 2]); const q = f ? h.poolRequireAt(f.ip) : null;
  report.rejects.push({label, rejectedConsensus: v.verdict.consensus !== true, rejectedStandard: v.verdict.standard !== true, failingInput: f?.input, guard: q ? `ShieldPool.scash:${q.line} ${q.text}` : f?.error});
  assert.notEqual(v.verdict.consensus, true); assert.notEqual(v.verdict.standard, true);
  assert.equal(f?.input, POOL); assert.ok(q?.text.includes(req), `expected "${req}", got ${q?.text ?? f?.error}`);
});
test('real key reject: stale proof (deposit proof replayed on the post-deposit state)', {skip: !ready}, () => {
  const p = clonePlan(plans[0]); p.inputs[3].coin = {...states[1].pool}; p.inputs.slice(0, 3).forEach((x, i) => { x.coin = {...states[1].verifiers[i]}; });
  p.inputs[4].coin = {...states[1].alice}; p.outputs[0].value = states[1].pool.value + plans[0].publicAmount;
  const b = finalize(p, proofs[0].U); const v = verifyTx(b); const f = firstFailure(b, [POOL]); const q = f ? h.poolRequireAt(f.ip) : null;
  report.rejects.push({label: 'stale proof replayed', rejectedConsensus: v.verdict.consensus !== true, rejectedStandard: v.verdict.standard !== true, failingInput: f?.input, guard: q ? `ShieldPool.scash:${q.line} ${q.text}` : f?.error});
  assert.notEqual(v.verdict.consensus, true); assert.ok(q?.text.includes('nftCommitment'));
});
