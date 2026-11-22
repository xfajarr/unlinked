// Unlinked Shield transaction builder: browser-portable (ESM, no node APIs). Spec sections 7, 9 and 9.1.
// Layout (fixed): inputs 0..2 verifier coins, 3 pool coin, 4.. funding (deposits); outputs 0 pool coin, 1 payout (only
// if payout > 0), then the 3 verifier coins recreated, then change (deposits only).
// Pool unlocking pushes: extData, N1, N0, C'1, C'0, redeem. Verifier unlockings are cap-filled to 10,000 B each
// (prover/unlock.mjs), so the size, and so the fee, is known before proving. Transfers and withdrawals carry the fee
// inside extData (bound by the proof): choose it from shieldTxSize() first.
// Dependencies: @bitauth/libauth >= 3.0.0 (encode/decode/txid only; no VM), @noble/curves 2.x and @noble/hashes 2.x
// (the Groth16 witness for the verifier). The prover is imported lazily on first use; one verification key per page.
import {decodeTransaction, encodeTransaction, hashTransaction} from '@bitauth/libauth';
import {VK_SOURCE} from './prover/vk-source.mjs';
import {beToBig, bigToBe, cat, concat, decodePushes, encodePushes, equal, fromHex, i64FromBe, i64be, pushData, reverse, sha256, toHex, u64be} from './bytes.mjs';

export * as bytes from './bytes.mjs';
export const R_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const MAX_FEE = 50000n, MAX_LOCK = 201, CT_LEN = 42, POOL_INPUT = 3, DUST = 546n;
export const N0_OFFSET = 357, N1_OFFSET = 389; // input 2 unlocking: STMT data at 101, n0/n1 at +256/+288, 32 B little-endian
const P2PKH_UNLOCKING_LEN = 100; // push(65 B schnorr sig) push(33 B pubkey)

const bin = (x) => (x instanceof Uint8Array ? x : fromHex(x));

export function encodeExtData({recipientLock = new Uint8Array(0), payout = 0n, fee = 0n, ct0, ct1}) {
  if (recipientLock.length > MAX_LOCK) throw new Error('recipientLock too long');
  if (ct0.length !== CT_LEN || ct1.length !== CT_LEN) throw new Error('ct must be 42 bytes');
  return concat(Uint8Array.of(recipientLock.length), recipientLock, u64be(payout), u64be(fee), ct0, ct1);
}
export function decodeExtData(e) {
  const L = e[0];
  if (L === undefined || L > MAX_LOCK || e.length !== 1 + L + 16 + 2 * CT_LEN) throw new Error('bad extData');
  const o = 1 + L;
  return {recipientLock: e.slice(1, o), payout: beToBig(e.slice(o, o + 8)), fee: beToBig(e.slice(o + 8, o + 16)), ct0: e.slice(o + 16, o + 58), ct1: e.slice(o + 58)};
}
export function bindingHash({S1, publicAmount, C0, C1, N0, N1, extData}) {
  const payload = concat(S1, i64be(publicAmount), C0, C1, N0, N1, sha256(extData));
  const H = sha256(payload); H[0] &= 0x1f;
  return {payload, H, h: beToBig(H)};
}
export function piecesOf(p) {
  const pa = typeof p.publicAmount === 'bigint' ? p.publicAmount : i64FromBe(bin(p.publicAmount));
  return {S1: bin(p.S1), publicAmount: pa, C0: bin(p.C0), C1: bin(p.C1), N0: bin(p.N0), N1: bin(p.N1), extData: bin(p.extData)};
}

// deployment: {network, category (genesis txid, UI hex), pool: {lockHex, redeemHex}, verifier: {lockHex, redeemHex, codePiecesHex, vk}}
export function deploymentOf(d) {
  if (d._norm) return d;
  const category = fromHex(d.category);
  return {...d, _norm: true, categoryBin: category, poolToken: concat(reverse(category), Uint8Array.of(1)),
    poolLock: fromHex(d.pool.lockHex), poolRedeem: fromHex(d.pool.redeemHex), verifierLock: fromHex(d.verifier.lockHex),
    prog: {R: fromHex(d.verifier.redeemHex), pieces: d.verifier.codePiecesHex.map(fromHex)}};
}
export const poolUnlocking = (dep, {C0, C1, N0, N1, extData}) => concat(encodePushes([extData, N1, N0, C1, C0]), pushData(deploymentOf(dep).poolRedeem));

const vkFixtures = (v) => {
  if (v.alpha) return v;
  if (v.protocol !== 'groth16' || v.curve !== 'bn128' || v.nPublic !== 2) throw new Error('need a BN254 groth16 key with 2 public inputs');
  const g1 = (P) => ({x: P[0], y: P[1]}), g2 = (P) => ({x: {c0: P[0][0], c1: P[0][1]}, y: {c0: P[1][0], c1: P[1][1]}});
  return {alpha: g1(v.vk_alpha_1), beta: g2(v.vk_beta_2), gamma: g2(v.vk_gamma_2), delta: g2(v.vk_delta_2), ic: v.IC.map(g1)};
};
let proverP = null;
export function loadProver(vk) {
  VK_SOURCE.set(vkFixtures(vk));
  return (proverP ??= import('./prover/unlock.mjs'));
}
const proofOf = (pf) => ({a: {x: pf.pi_a[0], y: pf.pi_a[1]}, b: {x: {c0: pf.pi_b[0][0], c1: pf.pi_b[0][1]}, y: {c0: pf.pi_b[1][0], c1: pf.pi_b[1][1]}}, c: {x: pf.pi_c[0], y: pf.pi_c[1]}});
// the 3 verifier unlockings for a snarkjs proof of [S0, H] (fills: override, e.g. VM-sized; default cap fills)
export async function verifierUnlockings(dep, proof, publicSignals, {fills} = {}) {
  const D = deploymentOf(dep); const P = await loadProver(D.verifier.vk);
  const core = P.proveCore({proof: proofOf(proof), publicInputs: publicSignals.map(String)}); // also checks the Groth16 equation
  const f = fills ?? P.capFills(core, D.prog);
  return {unlockings: P.unlockingsFor(core, D.prog, f).unlockings, fills: f};
}

// utxo: {txid (UI hex), vout, value (bigint|number), lockHex?, token?: {category (UI hex), nft: {capability, commitment (hex)}}}
const tokenOf = (t) => t && {amount: BigInt(t.amount ?? 0), category: bin(t.category), ...(t.nft ? {nft: {capability: t.nft.capability, commitment: bin(t.nft.commitment)}} : {})};
const sourceOf = (u, lock) => ({lockingBytecode: lock ?? bin(u.lockHex), valueSatoshis: BigInt(u.value), ...(u.token ? {token: tokenOf(u.token)} : {})});
const inputOf = (u, unlocking) => ({outpointTransactionHash: bin(u.txid), outpointIndex: u.vout, sequenceNumber: 0, unlockingBytecode: unlocking});
const out = (lock, value, token) => ({lockingBytecode: lock, valueSatoshis: BigInt(value), ...(token ? {token} : {})});

export function planShieldTx({deployment, poolUtxo, verifierUtxos, pieces, fundingUtxos = [], changeLock}) {
  const D = deploymentOf(deployment); const P = piecesOf(pieces); const ext = decodeExtData(P.extData);
  if (verifierUtxos.length !== 3) throw new Error('need the 3 verifier coins');
  const pa = P.publicAmount;
  if (pa > 0n && (ext.payout !== 0n || ext.fee !== 0n)) throw new Error('deposit: payout and fee must be 0');
  if (pa <= 0n && (-pa !== ext.payout + ext.fee || ext.fee > MAX_FEE)) throw new Error('-publicAmount must equal payout + fee, fee <= 50,000');
  if (pa <= 0n && fundingUtxos.length) throw new Error('funding inputs only for deposits');
  if (pa > 0n && (!fundingUtxos.length || !changeLock)) throw new Error('a deposit needs fundingUtxos and a changeLock');
  const poolValue = BigInt(poolUtxo.value) + pa;
  const outputs = [out(D.poolLock, poolValue, {amount: 0n, category: D.categoryBin, nft: {capability: 'mutable', commitment: P.S1}})];
  if (ext.payout > 0n) outputs.push(out(ext.recipientLock, ext.payout));
  verifierUtxos.forEach((v) => outputs.push(out(D.verifierLock, v.value)));
  const inputs = [...verifierUtxos.map((v) => inputOf(v, new Uint8Array(0))), inputOf(poolUtxo, poolUnlocking(D, P)), ...fundingUtxos.map((f) => inputOf(f, new Uint8Array(0)))];
  const sourceOutputs = [...verifierUtxos.map((v) => sourceOf(v, D.verifierLock)), sourceOf(poolUtxo, D.poolLock), ...fundingUtxos.map((f) => sourceOf(f))];
  return {D, P, ext, pa, transaction: {version: 2, locktime: 0, inputs, outputs}, sourceOutputs, changeLock: changeLock && bin(changeLock)};
}
const sizeWith = (tx, vUnl, fundingLen) => encodeTransaction({...tx, inputs: tx.inputs.map((x, i) => ({...x, unlockingBytecode: i < 3 ? vUnl[i] : i > POOL_INPUT ? new Uint8Array(fundingLen) : x.unlockingBytecode}))}).length;

// exact size of a pool transaction before any proof exists (cap-filled verifier unlockings are 10,000 B each)
export function shieldTxSize({deployment, extDataLength = 101, payoutLockLength = 0, fundingCount = 0, change = fundingCount > 0}) {
  const D = deploymentOf(deployment); const z = (n) => new Uint8Array(n);
  const tx = {version: 2, locktime: 0,
    inputs: [...[0, 1, 2].map(() => inputOf({txid: z(32), vout: 1}, z(10000))), inputOf({txid: z(32), vout: 0}, poolUnlocking(D, {C0: z(32), C1: z(32), N0: z(32), N1: z(32), extData: z(extDataLength)})),
      ...Array.from({length: fundingCount}, () => inputOf({txid: z(32), vout: 0}, z(P2PKH_UNLOCKING_LEN)))],
    outputs: [out(D.poolLock, 1000n, {amount: 0n, category: D.categoryBin, nft: {capability: 'mutable', commitment: z(32)}}),
      ...(payoutLockLength ? [out(z(payoutLockLength), 1000n)] : []), ...[0, 1, 2].map(() => out(D.verifierLock, 1000n)), ...(change ? [out(z(25), 1000n)] : [])]};
  return encodeTransaction(tx).length;
}
export const feeForSize = (size, feeRate = 1.0) => BigInt(Math.ceil(size * feeRate));

// signFunding(transaction, sourceOutputs, inputIndex) -> unlocking bytecode (P2PKH, 100 B schnorr form expected)
// fills: override the cap fillers (tests); checkFee: false skips the fee-rate floor (tests replaying low-fee fixtures)
export async function buildShieldTx({deployment, poolUtxo, verifierUtxos, proof, publicSignals, pieces, fundingUtxos = [], signFunding, changeLock, feeRate = 1.0, fills, checkFee = true}) {
  const plan = planShieldTx({deployment, poolUtxo, verifierUtxos, pieces, fundingUtxos, changeLock});
  const {D, P, ext, pa, transaction: tx, sourceOutputs} = plan;
  if (checkFee && feeRate < 1.0) throw new Error('feeRate below the 1 sat/B relay minimum');
  const S0 = bin(poolUtxo.token.nft.commitment);
  if (beToBig(S0).toString() !== String(publicSignals[0])) throw new Error('proof S0 is not the pool commitment');
  const {h} = bindingHash(P);
  if (h.toString() !== String(publicSignals[1])) throw new Error('proof H does not match the pieces');
  const {unlockings: V, fills: F} = await verifierUnlockings(D, proof, publicSignals, {fills});
  let fee;
  if (pa > 0n) {
    const funding = sourceOutputs.slice(POOL_INPUT + 1).reduce((a, o) => a + o.valueSatoshis, 0n);
    tx.outputs.push(out(plan.changeLock, 0n));
    fee = feeForSize(sizeWith(tx, V, P2PKH_UNLOCKING_LEN), feeRate);
    const change = funding - pa - fee;
    if (change < DUST) { tx.outputs.pop(); fee = funding - pa; if (fee < feeForSize(sizeWith(tx, V, P2PKH_UNLOCKING_LEN), feeRate)) throw new Error('funding too small for the deposit and its fee'); }
    else tx.outputs.at(-1).valueSatoshis = change;
  } else {
    fee = ext.fee;
    const need = feeForSize(sizeWith(tx, V, 0), feeRate);
    if (checkFee && fee < need) throw new Error(`fee ${fee} in extData is below ${need} (${feeRate} sat/B); size it with shieldTxSize() before proving`);
  }
  tx.inputs.forEach((x, i) => { if (i < 3) x.unlockingBytecode = V[i]; });
  for (let i = POOL_INPUT + 1; i < tx.inputs.length; i++) {
    if (!signFunding) throw new Error('signFunding is required for funding inputs');
    tx.inputs[i].unlockingBytecode = await signFunding(tx, sourceOutputs, i);
  }
  const encoded = encodeTransaction(tx);
  if (pa > 0n && BigInt(Math.ceil(encoded.length * feeRate)) > fee) throw new Error('funding unlocking larger than expected: fee rate fell below target');
  return {txHex: toHex(encoded), txid: hashTransaction(encoded), size: encoded.length, fee, fills: F, transaction: tx, sourceOutputs};
}

export function poolFromTx(txHex) {
  const tx = decodeTransaction(bin(txHex));
  if (typeof tx === 'string') throw new Error(tx);
  const pushes = decodePushes(tx.inputs[POOL_INPUT].unlockingBytecode);
  if (pushes.length !== 6) throw new Error('input 3 is not a pool unlocking');
  const [extData, N1, N0, C1, C0] = pushes.map((x) => Uint8Array.from(x));
  const ext = decodeExtData(extData);
  const o0 = tx.outputs[0];
  if (!o0.token?.nft || o0.token.nft.capability !== 'mutable') throw new Error('output 0 is not the pool coin');
  const u2 = tx.inputs[2].unlockingBytecode;
  const v = ext.payout > 0n ? 2 : 1;
  return {
    txid: hashTransaction(bin(txHex)),
    category: toHex(o0.token.category), S1: Uint8Array.from(o0.token.nft.commitment), poolValue: o0.valueSatoshis, poolLock: Uint8Array.from(o0.lockingBytecode),
    S0: reverse(u2.slice(N0_OFFSET, N0_OFFSET + 32)), H: reverse(u2.slice(N1_OFFSET, N1_OFFSET + 32)),
    C0, C1, N0, N1, extData, ext,
    // known from the transaction alone when the pool paid; for a deposit it is poolValue - (previous pool value)
    publicAmount: ext.payout + ext.fee > 0n ? -(ext.payout + ext.fee) : null,
    payout: ext.payout > 0n ? {lock: Uint8Array.from(tx.outputs[1].lockingBytecode), value: tx.outputs[1].valueSatoshis} : null,
    poolOutpoint: {vout: 0}, verifierOutpoints: [v, v + 1, v + 2].map((vout) => ({vout, value: tx.outputs[vout].valueSatoshis})),
    spentPool: {txid: toHex(tx.inputs[POOL_INPUT].outpointTransactionHash), vout: tx.inputs[POOL_INPUT].outpointIndex},
  };
}
export {fromHex, toHex, cat, equal};
