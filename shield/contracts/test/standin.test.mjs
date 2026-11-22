// ShieldPool with the TEST-ONLY free-statement stand-in key: genesis, deposit, transfer, withdraw, and the reject suite.
// Every verdict is the BCH 2026 VM's, for the whole transaction, consensus and standard.
//   node --test test/standin.test.mjs        (report: build/standin.report.json)
import {test, after} from 'node:test';
import {writeFileSync} from 'node:fs';
import {proveFree, shutdown, STANDIN_VK} from '../standin/prove.mjs';
import * as h from './harness.mjs';
const {assert, fe, rnd, keys, locks, be32, encodeExtData, bindingHash, finalize, clonePlan, planTransact, setPoolArgs, prove, nextState, verifyTx, firstFailure,
  genesisTx, signP2pkh, poolTokenData, p2sh32, DROP_ALL, sha256} = h;

const GENESIS_TXID = sha256(Buffer.from('unlinked shield test genesis')).toString('hex');
const D = await h.deployment({vkPath: STANDIN_VK, buildPath: h.HERE + 'build/standin.build.json', genesisTxid: GENESIS_TXID, prover: proveFree});
const report = {key: 'stand-in (TEST ONLY, free statement)', verifier: {lockHex: D.verifierLock.toString('hex'), codeBytes: D.prog.json.codeBytes, codeSha256: D.prog.json.codeSha256, redeemBytes: D.prog.R.length},
  pool: {lockHex: D.pool.lock.toString('hex'), redeemBytes: D.pool.redeem.length, address: D.pool.address}, valid: [], rejects: []};
after(async () => { writeFileSync(h.HERE + 'build/standin.report.json', JSON.stringify(report, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 1) + '\n'); await shutdown(); });

const MINER_FEE = 30000n, DEPOSIT = 100000n, PAYOUT = 40000n;
const ct = () => rnd(42);
function accept(label, built, extra = {}) {
  const v = verifyTx(built, {metrics: true});
  const fee = built.sourceOutputs.reduce((a, o) => a + o.valueSatoshis, 0n) - built.transaction.outputs.reduce((a, o) => a + o.valueSatoshis, 0n);
  report.valid.push({label, txBytes: v.txBytes, minerFee: fee, satPerByte: +(Number(fee) / v.txBytes).toFixed(3), verdict: v.verdict, inputs: v.inputs, ...extra});
  assert.equal(v.verdict.consensus, true, `${label}: consensus ${v.verdict.consensus}`);
  assert.equal(v.verdict.standard, true, `${label}: standard ${v.verdict.standard}`);
  return v;
}
// expect: {input, require: <text of the ShieldPool require that must fire>} | {input, verifier: true} | {input, error: <substring>}
function reject(label, built, expect) {
  const v = verifyTx(built);
  const order = [expect.input, ...built.transaction.inputs.map((_, i) => i).filter((i) => i !== expect.input)];
  const f = firstFailure(built, order);
  const isPool = f && Buffer.from(built.sourceOutputs[f.input].lockingBytecode).equals(D.pool.lock);
  const req = isPool ? h.poolRequireAt(f.ip) : null;
  const guard = isPool ? (req ? `ShieldPool.scash:${req.line} ${req.text}` : `pool: ${f.error}`) : f ? `verifier input ${f.input}: ${f.error}` : null;
  report.rejects.push({label, rejectedConsensus: v.verdict.consensus !== true, rejectedStandard: v.verdict.standard !== true, consensus: v.verdict.consensus, standard: v.verdict.standard, failingInput: f?.input ?? null, guard});
  assert.notEqual(v.verdict.consensus, true, `${label}: consensus ACCEPTED`);
  assert.notEqual(v.verdict.standard, true, `${label}: standard ACCEPTED`);
  assert.equal(f?.input, expect.input, `${label}: expected input ${expect.input} to fail, got ${guard}`);
  if (expect.require) assert.ok(req && req.text.includes(expect.require), `${label}: expected require "${expect.require}", got ${guard}`);
  if (expect.verifier) assert.ok(!isPool, `${label}: expected a verifier input to reject, got ${guard}`);
  if (expect.error) assert.ok(String(f.error).includes(expect.error), `${label}: expected error "${expect.error}", got ${guard}`);
}

const fundingCoin = {txid: Buffer.from(GENESIS_TXID, 'hex'), vout: 0, value: 2_000_000n, lock: locks.alice};
const S_GENESIS = fe();
let G, st, chain = {};
test('genesis: pool NFT (mutable, S_genesis) and 3 verifier coins', () => {
  G = genesisTx({funding: fundingCoin, sGenesis: S_GENESIS, verifierLock: D.verifierLock, changeLock: locks.alice, fee: 1000n});
  assert.ok(G.pool.lock.equals(D.pool.lock));
  signP2pkh(G.transaction, G.sourceOutputs, 0, keys.alice);
  accept('genesis', G);
  const txid = h.txidOf(G.transaction); const coin = (i) => ({txid, vout: i, value: G.transaction.outputs[i].valueSatoshis, lock: Buffer.from(G.transaction.outputs[i].lockingBytecode), token: G.transaction.outputs[i].token});
  st = {pool: coin(0), verifiers: [coin(1), coin(2), coin(3)]}; chain.alice = coin(4);
});

let PD, TD, PT, TT, PW, TW, stD, stT, stW;
test('deposit: +100,000 sat from a P2PKH input, change back', async () => {
  const t = {S1: fe(), publicAmount: DEPOSIT, args: {C0: fe(), C1: fe(), N0: be32(0n), N1: be32(0n)}, ext: {ct0: ct(), ct1: ct()},
    funding: [{coin: chain.alice, priv: keys.alice}], change: {lock: locks.alice, value: chain.alice.value - DEPOSIT - MINER_FEE}};
  PD = planTransact(D, st, t); TD = await prove(D, PD);
  const b = finalize(PD, TD.U); accept('deposit', b, {fills: TD.fills, ms: TD.ms});
  stD = nextState(PD, b.transaction); chain.alice2 = stD.extra[0];
});
test('transfer: pool pays the 30,000 sat fee, no payout', async () => {
  const t = {S1: fe(), publicAmount: -MINER_FEE, args: {C0: fe(), C1: fe(), N0: fe(), N1: fe()}, ext: {fee: MINER_FEE, ct0: ct(), ct1: ct()}};
  PT = planTransact(D, stD, t); TT = await prove(D, PT, {fills0: TD.fills});
  const b = finalize(PT, TT.U); accept('transfer', b, {fills: TT.fills, ms: TT.ms});
  stT = nextState(PT, b.transaction);
});
test('withdraw: payout 40,000 sat to a P2PKH, fee 30,000 from the pool', async () => {
  const t = {S1: fe(), publicAmount: -(PAYOUT + MINER_FEE), args: {C0: fe(), C1: fe(), N0: fe(), N1: be32(0n)},
    ext: {recipientLock: locks.bob, payout: PAYOUT, fee: MINER_FEE, ct0: ct(), ct1: ct()}};
  PW = planTransact(D, stT, t); TW = await prove(D, PW, {fills0: TT.fills});
  const b = finalize(PW, TW.U); accept('withdraw', b, {fills: TW.fills, ms: TW.ms});
  stW = nextState(PW, b.transaction);
  assert.equal(stW.pool.value, 1000n); assert.equal(stW.payout.value, PAYOUT);
});

// mutate a copy of an honest plan, keep its proof (verifier unlockings), rebuild and re-sign, expect the VM to reject
const POOL = 3;
const mutW = (f) => { const p = clonePlan(PW); f(p); return finalize(p, TW.U); };
const mutD = (f) => { const p = clonePlan(PD); f(p); return finalize(p, TD.U); };
const mutT = (f) => { const p = clonePlan(PT); f(p); return finalize(p, TT.U); };
const flip = (b, i = 0) => { const c = Buffer.from(b); c[i] ^= 1; return c; };
const tokenWith = (o, patch) => ({...o.token, ...patch, nft: {...o.token.nft, ...(patch.nft ?? {})}});

const cases = [
  ['payload S1 tampered (output 0 commitment)', () => mutW((p) => { p.outputs[0].token = tokenWith(p.outputs[0], {nft: {commitment: flip(PW.S1, 31)}}); }), {input: POOL, require: '== hm'}],
  ['payload C\'0 tampered', () => mutW((p) => setPoolArgs(D, p, {C0: flip(PW.args.C0, 31)})), {input: POOL, require: '== hm'}],
  ['payload C\'1 tampered', () => mutW((p) => setPoolArgs(D, p, {C1: flip(PW.args.C1, 31)})), {input: POOL, require: '== hm'}],
  ['payload N0 tampered', () => mutW((p) => setPoolArgs(D, p, {N0: flip(PW.args.N0, 31)})), {input: POOL, require: '== hm'}],
  ['payload N1 tampered', () => mutW((p) => setPoolArgs(D, p, {N1: flip(PW.args.N1, 31)})), {input: POOL, require: '== hm'}],
  ['payload extData tampered (ct1 byte)', () => mutW((p) => setPoolArgs(D, p, {extData: flip(PW.args.extData, PW.args.extData.length - 1)})), {input: POOL, require: '== hm'}],
  ['payload extData tampered (recipient swapped, output 1 follows)', () => mutW((p) => {
    setPoolArgs(D, p, {extData: encodeExtData({recipientLock: locks.thief, payout: PAYOUT, fee: MINER_FEE, ct0: Buffer.alloc(42), ct1: Buffer.alloc(42)})}); p.outputs[1].lock = locks.thief; }), {input: POOL, require: '== hm'}],
  ['NFT commitment not updated (output 0 keeps S0)', () => mutW((p) => { p.outputs[0].token = tokenWith(p.outputs[0], {nft: {commitment: PW.S0}}); }), {input: POOL, require: '== hm'}],
  ['pool value != old + publicAmount (withdraw, pool keeps 1 sat more)', () => mutW((p) => { p.outputs[0].value += 1n; }), {input: POOL, require: '0 - publicAmount == payout + fee'}],
  ['pool value != old + publicAmount (deposit, pool gets 1 sat less, change +1)', () => mutD((p) => { p.outputs[0].value -= 1n; p.outputs.at(-1).value += 1n; }), {input: POOL, require: '== hm'}],
  ['payout to another lock', () => mutW((p) => { p.outputs[1].lock = locks.thief; }), {input: POOL, require: 'outputs[1].lockingBytecode == recipientLock'}],
  ['payout 1 sat short', () => mutW((p) => { p.outputs[1].value -= 1n; }), {input: POOL, require: 'outputs[1].value == payout'}],
  ['payout 1,000 sat over (taken from the fee)', () => mutW((p) => { p.outputs[1].value += 1000n; }), {input: POOL, require: 'outputs[1].value == payout'}],
  ['extra output skimming 1,000 sat of the fee', () => mutW((p) => { p.outputs.push({lock: locks.thief, value: 1000n}); }), {input: POOL, require: 'outputs.length == v + 3'}],
  ['extra output on a transfer', () => mutT((p) => { p.outputs.push({lock: locks.thief, value: 1000n}); }), {input: POOL, require: 'outputs.length == v + 3'}],
  ['verifier coin not recreated (output to another lock)', () => mutW((p) => { p.outputs[4].lock = locks.thief; }), {input: POOL, require: 'outputs[v + 2].lockingBytecode == verifierLock'}],
  ['verifier coin recreated 1 sat short', () => mutW((p) => { p.outputs[3].value -= 1n; }), {input: POOL, require: 'outputs[v + 1].value == tx.inputs[1].value'}],
  ['verifier coins not recreated at all (transfer, outputs dropped)', () => mutT((p) => { p.outputs.splice(1, 3); }), {input: POOL, error: 'invalid transaction output index'}],
  ['NFT category swapped (fresh genesis category from the pool outpoint)', () => mutW((p) => { p.outputs[0].token = tokenWith(p.outputs[0], {category: Buffer.from(p.inputs[3].coin.txid)}); }), {input: POOL, require: 'outputs[0].tokenCategory == poolToken'}],
  ['NFT capability downgraded to immutable', () => mutW((p) => { p.outputs[0].token = tokenWith(p.outputs[0], {nft: {capability: 'none'}}); }), {input: POOL, require: 'outputs[0].tokenCategory == poolToken'}],
  ['NFT moved off the pool lock (output 0 to another P2SH32)', () => mutW((p) => { p.outputs[0].lock = p2sh32(DROP_ALL); }), {input: POOL, require: 'outputs[0].lockingBytecode == tx.inputs[3].lockingBytecode'}],
  ['verifier inputs at the wrong lock (drop-all P2SH32 coins, same STMT bytes)', () => {
    const p = clonePlan(PW); p.inputs.slice(0, 3).forEach((x) => { x.coin.lock = p2sh32(DROP_ALL); });
    const fake = TW.U.map((u) => Buffer.concat([u.subarray(0, u.length - 1 - D.prog.R.length), Buffer.from([DROP_ALL.length]), DROP_ALL])); // R push -> DROP_ALL push
    return finalize(p, fake); }, {input: POOL, require: 'inputs[0].lockingBytecode == verifierLock'}],
  ['verifier inputs missing (pool alone at input 0)', () => mutW((p) => { p.inputs.splice(0, 3); }), {input: 0, require: 'activeInputIndex == 3'}],
  ['fake pool coin without the NFT (same lock, no token in or out)', () => mutW((p) => { delete p.inputs[3].coin.token; delete p.outputs[0].token; }), {input: POOL, require: 'inputs[3].tokenCategory == poolToken'}],
  ['verifier coins spent without the pool (input 3 is a P2PKH coin)', () => {
    const p = clonePlan(PW); p.inputs[3] = {coin: stD.extra[0], kind: 'p2pkh', priv: keys.alice}; p.outputs = [{lock: locks.thief, value: 2000n}];
    return finalize(p, TW.U); }, {input: 0, verifier: true}],
  ['stale proof replayed (withdraw proof on the next state: wrong S0)', () => {
    const p = planTransact(D, stW, {S1: PW.S1, publicAmount: 0n, extData: PW.args.extData, args: PW.args});
    p.outputs[0].value = stW.pool.value; return finalize(p, TW.U); }, {input: POOL, require: 'nftCommitment'}],
];
for (const [label, build, expect] of cases) test('reject: ' + label, () => reject(label, build(), expect));

// rejects that need a proof of their own (valid Groth16 proof, binding hash correct, a pool rule must fire)
test('reject: wrong S0 (valid proof for another state)', async () => {
  const p = clonePlan(PW); const P = await prove(D, p, {n0: BigInt('0x' + fe().toString('hex')), fills0: TW.fills});
  reject('wrong S0 (valid proof for another state)', finalize(p, P.U), {input: POOL, require: 'nftCommitment'});
});
test('reject: payload publicAmount tampered (proof binds publicAmount + 1)', async () => {
  const p = clonePlan(PW); const H = bindingHash({S1: p.S1, publicAmount: p.publicAmount + 1n, ...p.args});
  const P = await prove(D, p, {n1: H.h, fills0: TW.fills});
  reject('payload publicAmount tampered (proof binds publicAmount + 1)', finalize(p, P.U), {input: POOL, require: '== hm'});
});
test('reject: fee over the cap (50,001 sat, honest binding)', async () => {
  const fee = 50001n;
  const p = planTransact(D, stD, {S1: fe(), publicAmount: -(PAYOUT + fee), args: {C0: fe(), C1: fe(), N0: fe(), N1: fe()}, ext: {recipientLock: locks.bob, payout: PAYOUT, fee, ct0: ct(), ct1: ct()}});
  const P = await prove(D, p, {fills0: TW.fills});
  reject('fee over the cap (50,001 sat, honest binding)', finalize(p, P.U), {input: POOL, require: 'fee <= 50000'});
});
test('control: fee exactly at the cap (50,000 sat) is accepted', async () => {
  const fee = 50000n;
  const p = planTransact(D, stD, {S1: fe(), publicAmount: -(PAYOUT + fee), args: {C0: fe(), C1: fe(), N0: fe(), N1: fe()}, ext: {recipientLock: locks.bob, payout: PAYOUT, fee, ct0: ct(), ct1: ct()}});
  const P = await prove(D, p, {fills0: TW.fills});
  accept('control: withdraw with fee = MAX_FEE', finalize(p, P.U));
});
test('reject: deposit claiming a payout (honest binding)', async () => {
  const p = planTransact(D, st, {S1: fe(), publicAmount: DEPOSIT, args: {C0: fe(), C1: fe(), N0: be32(0n), N1: be32(0n)}, ext: {recipientLock: locks.alice, payout: 5000n, fee: 0n, ct0: ct(), ct1: ct()},
    funding: [{coin: chain.alice, priv: keys.alice}], change: {lock: locks.alice, value: chain.alice.value - DEPOSIT - MINER_FEE - 5000n}});
  const P = await prove(D, p, {fills0: TD.fills});
  reject('deposit claiming a payout (honest binding)', finalize(p, P.U), {input: POOL, require: 'payout == 0'});
});
test('reject: deposit claiming a fee (honest binding)', async () => {
  const p = planTransact(D, st, {S1: fe(), publicAmount: DEPOSIT, args: {C0: fe(), C1: fe(), N0: be32(0n), N1: be32(0n)}, ext: {fee: 1000n, ct0: ct(), ct1: ct()},
    funding: [{coin: chain.alice, priv: keys.alice}], change: {lock: locks.alice, value: chain.alice.value - DEPOSIT - MINER_FEE}});
  const P = await prove(D, p, {fills0: TD.fills});
  reject('deposit claiming a fee (honest binding)', finalize(p, P.U), {input: POOL, require: 'fee == 0'});
});
test('reject: withdraw where payout + fee != -publicAmount (honest binding)', async () => {
  const p = planTransact(D, stT, {S1: fe(), publicAmount: -(PAYOUT + MINER_FEE + 1n), args: {C0: fe(), C1: fe(), N0: fe(), N1: fe()}, ext: {recipientLock: locks.bob, payout: PAYOUT, fee: MINER_FEE, ct0: ct(), ct1: ct()}});
  const P = await prove(D, p, {fills0: TW.fills});
  reject('withdraw where payout + fee != -publicAmount (honest binding)', finalize(p, P.U), {input: POOL, require: '0 - publicAmount == payout + fee'});
});
