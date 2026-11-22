// Unlinked Shield pool: payload encoding (spec section 7), the SolidCash pool contract, and transaction assembly.
// Bytes and VM come from the vendored libauth 3.1.0-next.8 with the OP_DEFINE patch (verifier/verifier.mjs), so
// every verdict matches BCHN's op-cost accounting. SolidCash is used only to compile the contract and encode its
// unlocking arguments.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {Contract} from '@solidcash/solidcash';
import {MockNetworkProvider} from '@solidcash/solidcash/network/mock';
import {libauth, VMS, POOL_INPUT} from './verifier/verifier.mjs';

export {libauth, VMS, POOL_INPUT};
export const R_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const MAX_FEE = 50000n;
export const MAX_LOCK = 201;
export const CT_LEN = 42;
const HERE = new URL('./', import.meta.url).pathname;

export const sha256 = (...b) => createHash('sha256').update(Buffer.concat(b.map((x) => Buffer.from(x)))).digest();
export const be32 = (x) => { assert.ok(x >= 0n && x < 2n ** 256n); return Buffer.from(x.toString(16).padStart(64, '0'), 'hex'); };
export const fromBe = (b) => BigInt('0x' + (Buffer.from(b).toString('hex') || '0'));
export const u64be = (x) => { assert.ok(x >= 0n && x < 2n ** 64n, 'u64 range'); return be32(x).subarray(24); };
export const i64be = (x) => { assert.ok(x >= -(2n ** 63n) && x < 2n ** 63n, 'i64 range'); return u64be(x < 0n ? x + 2n ** 64n : x); };

// extData = len (1 B) ‖ recipientLock (≤ 201 B) ‖ payout (u64 BE) ‖ fee (u64 BE) ‖ ct0 (42 B) ‖ ct1 (42 B)
export function encodeExtData({recipientLock = Buffer.alloc(0), payout = 0n, fee = 0n, ct0 = Buffer.alloc(CT_LEN), ct1 = Buffer.alloc(CT_LEN)}) {
  assert.ok(recipientLock.length <= MAX_LOCK); assert.equal(ct0.length, CT_LEN); assert.equal(ct1.length, CT_LEN);
  return Buffer.concat([Buffer.from([recipientLock.length]), Buffer.from(recipientLock), u64be(payout), u64be(fee), Buffer.from(ct0), Buffer.from(ct1)]);
}
export function decodeExtData(e) {
  const L = e[0]; assert.equal(e.length, 1 + L + 16 + 2 * CT_LEN, 'extData length');
  const o = 1 + L;
  return {recipientLock: e.subarray(1, o), payout: fromBe(e.subarray(o, o + 8)), fee: fromBe(e.subarray(o + 8, o + 16)), ct0: e.subarray(o + 16, o + 58), ct1: e.subarray(o + 58)};
}
// payload (200 B) = S1 ‖ publicAmount (i64 BE) ‖ C'0 ‖ C'1 ‖ N0 ‖ N1 ‖ sha256(extData); H = sha256(payload), H[0] &= 0x1f
export function bindingHash({S1, publicAmount, C0, C1, N0, N1, extData}) {
  const payload = Buffer.concat([S1, i64be(publicAmount), C0, C1, N0, N1, sha256(extData)].map((x) => Buffer.from(x)));
  assert.equal(payload.length, 200);
  const H = sha256(payload); H[0] &= 0x1f;
  return {payload, H, h: fromBe(H)};
}

const ART = HERE + 'build/ShieldPool.json', SRC = HERE + 'ShieldPool.scash';
export function loadArtifact() {
  if (!existsSync(ART) || statSync(ART).mtimeMs < statSync(SRC).mtimeMs) {
    const r = spawnSync(HERE + 'node_modules/.bin/solidc', [SRC, '-o', ART], {encoding: 'utf8'});
    if (r.status !== 0) throw new Error('solidc failed: ' + r.stderr + r.stdout);
  }
  return JSON.parse(readFileSync(ART, 'utf8'));
}
// verifierLock: the verifiers' P2SH32 locking bytecode; poolToken: category (introspection order) ‖ 0x01
export function poolContract(verifierLock, poolToken) {
  const c = new Contract(loadArtifact(), [Uint8Array.from(verifierLock), Uint8Array.from(poolToken)], {provider: new MockNetworkProvider()});
  assert.equal(c.addressType, 'p2sh32');
  return {
    contract: c, address: c.address, lock: Buffer.from(c.lockingBytecode, 'hex'), redeem: Buffer.from(c.bytecodeBin),
    unlocking: ({C0, C1, N0, N1, extData}) => Buffer.from(c.unlock.transact(...[C0, C1, N0, N1, extData].map((x) => Uint8Array.from(x)))
      .generateUnlockingBytecode({transaction: {inputs: [], outputs: []}, sourceOutputs: [], inputIndex: POOL_INPUT})),
  };
}

export const p2pkhLock = (pub) => Buffer.from([0x76, 0xa9, 0x14, ...libauth.hash160(pub), 0x88, 0xac]);
export const pubOf = (priv) => Buffer.from(libauth.secp256k1.derivePublicKeyCompressed(priv));
const SIGHASH_ALL_FORKID = 0x41;
// sign input i (P2PKH) of a libauth transaction in place: SIGHASH_ALL covers every output, so nobody can change them
export function signP2pkh(transaction, sourceOutputs, i, priv) {
  const ser = libauth.generateSigningSerializationBch({inputIndex: i, sourceOutputs, transaction},
    {coveredBytecode: sourceOutputs[i].lockingBytecode, signingSerializationType: Uint8Array.of(SIGHASH_ALL_FORKID)});
  const sig = libauth.secp256k1.signMessageHashSchnorr(priv, libauth.hash256(ser));
  assert.ok(typeof sig !== 'string', sig);
  transaction.inputs[i].unlockingBytecode = Uint8Array.from([...libauth.encodeDataPush(Uint8Array.from([...sig, SIGHASH_ALL_FORKID])), ...libauth.encodeDataPush(pubOf(priv))]);
}

// coin: {txid (Buffer, libauth order), vout, value, lock, token?}; token in libauth shape
// tokens are copied into plain Uint8Arrays: libauth does `category.slice().reverse()`, which on a Node Buffer (where
// slice is a view) would reverse the caller's bytes in place
const tokenOf = (t) => ({amount: BigInt(t.amount ?? 0n), category: Uint8Array.from(t.category), ...(t.nft ? {nft: {capability: t.nft.capability, commitment: Uint8Array.from(t.nft.commitment)}} : {})});
export const sourceOf = (c) => ({lockingBytecode: Uint8Array.from(c.lock), valueSatoshis: BigInt(c.value), ...(c.token ? {token: tokenOf(c.token)} : {})});
export const inputOf = (c, unlocking = Buffer.alloc(0)) => ({outpointTransactionHash: Uint8Array.from(c.txid), outpointIndex: c.vout, sequenceNumber: 0, unlockingBytecode: Uint8Array.from(unlocking)});
export const outputOf = (o) => ({lockingBytecode: Uint8Array.from(o.lock), valueSatoshis: BigInt(o.value), ...(o.token ? {token: tokenOf(o.token)} : {})});
export const poolTokenData = (category, commitment, capability = 'mutable') => ({amount: 0n, category: Uint8Array.from(category), nft: {capability, commitment: Uint8Array.from(commitment)}});
export const txidOf = (transaction) => Buffer.from(libauth.hashTransaction(libauth.encodeTransaction(transaction)), 'hex');
export const txBytes = (transaction) => libauth.encodeTransaction(transaction).length;

// whole-transaction verdicts from the BCH 2026 VM, consensus and standard; per-input metrics on request
export function verifyTx({transaction, sourceOutputs}, {metrics = false} = {}) {
  const verdict = {consensus: VMS.consensus.verify({transaction, sourceOutputs}), standard: VMS.standard.verify({transaction, sourceOutputs})};
  const out = {accepted: verdict.consensus === true && verdict.standard === true, verdict, txBytes: txBytes(transaction)};
  if (metrics) out.inputs = transaction.inputs.map((inp, i) => {
    const r = Object.fromEntries(['consensus', 'standard'].map((m) => { const st = VMS[m].evaluate({inputIndex: i, sourceOutputs, transaction}); const ok = VMS[m].stateSuccess(st); return [m, {ok: ok === true, error: ok === true ? null : ok, opCost: st.metrics.operationCost}]; }));
    const len = inp.unlockingBytecode.length, budget = (41 + len) * 800;
    return {input: i, unlockingBytes: len, lockingBytes: sourceOutputs[i].lockingBytecode.length, opStandard: r.standard.opCost, opConsensus: r.consensus.opCost, budget,
      marginPct: +(100 * (1 - r.standard.opCost / budget)).toFixed(2), accepted: r.standard.ok && r.consensus.ok, error: r.standard.error ?? r.consensus.error};
  });
  return out;
}
export function firstFailure({transaction, sourceOutputs}, order) {
  for (const i of order ?? transaction.inputs.map((_, k) => k)) {
    const st = VMS.standard.evaluate({inputIndex: i, sourceOutputs, transaction}); const ok = VMS.standard.stateSuccess(st);
    if (ok !== true) return {input: i, error: ok, ip: st.ip, instructions: st.instructions?.length, functionDepth: st.functionCount};
  }
  return null;
}
