// Test harness: full pool transactions (3 verifier inputs, the pool input, funding inputs), evaluated as a WHOLE in
// libauth's BCH 2026 VM (3.1.0-next.8 + the OP_DEFINE patch = BCHN op-cost accounting), consensus and standard.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {libauth, loadArtifact, poolContract, poolTokenData, p2pkhLock, pubOf, signP2pkh, sourceOf, inputOf, outputOf, verifyTx, firstFailure,
  bindingHash, encodeExtData, decodeExtData, be32, fromBe, R_FIELD, txidOf, sha256} from '../pool.mjs';
import {loadVerifier, poolTokenOf, vkFixturesFromSnarkjs, POOL_INPUT} from '../verifier/verifier.mjs';
import {genesisTx} from '../genesis.mjs';

export {assert, bindingHash, encodeExtData, decodeExtData, be32, fromBe, txidOf, p2pkhLock, pubOf, sha256};
export const HERE = new URL('../', import.meta.url).pathname;
export const rnd = (n) => randomBytes(n);
export const fe = () => be32(BigInt('0x' + randomBytes(32).toString('hex')) % R_FIELD); // random field element, 32 B BE
export const keys = {alice: Buffer.alloc(32, 0x11), bob: Buffer.alloc(32, 0x22), thief: Buffer.alloc(32, 0x33)};
export const locks = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, p2pkhLock(pubOf(v))]));
// a P2SH32 coin that anyone can spend with any pushes (drops them all): stands in for "a verifier at the wrong lock"
export const DROP_ALL = Buffer.from([0x65, 0x75, 0x74, 0x91, 0x66, 0x51]); // OP_BEGIN OP_DROP OP_DEPTH OP_NOT OP_UNTIL OP_1
export const p2sh32 = (redeem) => Buffer.from([0xaa, 0x20, ...libauth.hash256(redeem), 0x87]);

export async function deployment({vkPath, buildPath, genesisTxid, prover}) {
  const fxPath = buildPath.replace(/\.build\.json$/, '') + '.fixtures.json';
  writeFileSync(fxPath, JSON.stringify(vkFixturesFromSnarkjs(JSON.parse(readFileSync(vkPath, 'utf8'))), null, 1) + '\n');
  const V = await loadVerifier(fxPath);
  const category = Buffer.from(genesisTxid, 'hex');
  const poolToken = poolTokenOf(genesisTxid);
  const prog = V.buildCached(poolToken, buildPath);
  const pool = poolContract(prog.locking, poolToken);
  return {V, prog, pool, poolToken, category, verifierLock: prog.locking, prover};
}

// inputs: [{coin, kind: 'verifier', role} | {coin, kind: 'pool', unlocking} | {coin, kind: 'p2pkh', priv} | {coin, kind: 'raw', unlocking}]
export function finalize(plan, U, {sign = true} = {}) {
  const transaction = {version: 2, locktime: 0, inputs: plan.inputs.map((x) => inputOf(x.coin, x.kind === 'verifier' ? (U ? U[x.role] : Buffer.alloc(0)) : x.unlocking ?? Buffer.alloc(0))), outputs: plan.outputs.map(outputOf)};
  const sourceOutputs = plan.inputs.map((x) => sourceOf(x.coin));
  if (sign) plan.inputs.forEach((x, i) => { if (x.kind === 'p2pkh') signP2pkh(transaction, sourceOutputs, i, x.priv); });
  return {transaction, sourceOutputs};
}
export const clonePlan = (p) => ({...p, inputs: p.inputs.map((x) => ({...x, coin: {...x.coin}})), outputs: p.outputs.map((o) => ({...o})), args: {...p.args}});

// t: {S1, publicAmount, args: {C0, C1, N0, N1}, ext: {recipientLock, payout, fee, ct0, ct1}, funding: [{coin, priv}], change: {lock, value}}
export function planTransact(D, state, t) {
  const extData = t.extData ?? encodeExtData(t.ext ?? {});
  const args = {...t.args, extData};
  const poolOut = {lock: D.pool.lock, value: BigInt(state.pool.value) + t.publicAmount, token: poolTokenData(D.category, t.S1)};
  const outputs = [poolOut];
  if (t.ext?.payout > 0n) outputs.push({lock: t.ext.recipientLock, value: t.ext.payout});
  outputs.push(...state.verifiers.map((c) => ({lock: c.lock, value: c.value})));
  if (t.change) outputs.push(t.change);
  const inputs = [...state.verifiers.map((coin, role) => ({coin, kind: 'verifier', role})), {coin: state.pool, kind: 'pool', unlocking: D.pool.unlocking(args)},
    ...(t.funding ?? []).map((f) => ({coin: f.coin, kind: 'p2pkh', priv: f.priv}))];
  return {inputs, outputs, args, S0: state.pool.token.nft.commitment, S1: t.S1, publicAmount: t.publicAmount};
}
export const setPoolArgs = (D, plan, args) => { plan.args = {...plan.args, ...args}; plan.inputs.find((x) => x.kind === 'pool').unlocking = D.pool.unlocking(plan.args); return plan; };

// prove the statement (n0, n1) and size the verifier unlockings inside the plan's own transaction
// given: an existing snarkjs {proof, publicSignals} (e.g. from shield/fixtures/chain.json) instead of proving
export async function prove(D, plan, {n0, n1, fills0, given} = {}) {
  const H = bindingHash({S1: plan.S1, publicAmount: plan.publicAmount, ...plan.args});
  const s0 = n0 ?? fromBe(plan.S0), h = n1 ?? H.h;
  const t0 = Date.now(); const {proof, publicSignals} = given ?? await D.prover(s0, h); const proveMs = given ? null : Date.now() - t0;
  const t1 = Date.now(); const core = D.V.core(proof, publicSignals); const witnessMs = Date.now() - t1;
  const t2 = Date.now(); const sized = D.V.unlockings(core, D.prog, (U) => finalize(plan, U, {sign: false}), {fills0}); const sizeMs = Date.now() - t2;
  return {U: sized.unlockings, fills: sized.fills, n0: s0, n1: h, H, ms: {prove: proveMs, witness: witnessMs, size: sizeMs}};
}

export function nextState(plan, transaction) {
  const txid = txidOf(transaction); const coin = (vout) => ({txid, vout, value: transaction.outputs[vout].valueSatoshis, lock: Buffer.from(transaction.outputs[vout].lockingBytecode), token: transaction.outputs[vout].token});
  const v = plan.outputs.findIndex((o, i) => i > 0 && Buffer.from(o.lock).equals(plan.inputs[0].coin.lock));
  return {pool: coin(0), verifiers: [coin(v), coin(v + 1), coin(v + 2)], extra: plan.outputs.map((_, i) => coin(i)).slice(v + 3), payout: v === 2 ? coin(1) : null};
}

// which `require` of ShieldPool.scash a failing pool evaluation stopped at (libauth's ip is one past the failing opcode)
const ART = loadArtifact(), SRC = readFileSync(HERE + 'ShieldPool.scash', 'utf8').split('\n');
export function poolRequireAt(ip) { const q = ART.debug.requires.find((r) => r.ip === ip - 1); return q ? {line: q.line, text: SRC[q.line - 1].trim()} : null; }

export {verifyTx, firstFailure, genesisTx, poolTokenData, signP2pkh, sourceOf, inputOf, outputOf, POOL_INPUT};
