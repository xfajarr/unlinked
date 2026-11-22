// End to end on the deployed pool: deposit 200,000 sat (funding key -> a note for A), transfer A -> B, withdraw 100,000
// of B's note back to the funding address. Real proofs, the shield/tx builder, a local VM check before every send.
// Resumable: trees and notes are rebuilt from the pool's on-chain history on every run.
//   NETWORK=mainnet node deploy/e2e.mjs              plan: exact txs against real UTXOs, nothing sent
//   NETWORK=mainnet BROADCAST=1 node deploy/e2e.mjs  broadcasts (the user runs this)
//   DRY_RUN=1 NETWORK=... node deploy/e2e.mjs        local chain from deploy's dry run
import {readFileSync} from 'node:fs';
import {fundingKey, coinOf, broadcastChecked, waitForFunds, writeJson, readJson, existsSync, net, log, HERE, KEYS, DEPLOY_DIR, sleep, setFundingBudget, outPath, NETWORK, MODE, MAX_FEE_RATE} from './common.mjs';
import {libauth, signP2pkh, verifyTx} from '../pool.mjs';
import * as T from '../../tx/src/index.mjs';
import * as S from '../../lib/src/index.ts';
import * as snarkjs from '../standin/node_modules/snarkjs/main.js';

const BUILD = process.env.SHIELD_BUILD ?? new URL('../../circuits/build', import.meta.url).pathname;
const WASM = `${BUILD}/transact_js/transact.wasm`, ZKEY = `${BUILD}/transact_final.zkey`;
const REAL_DEP = DEPLOY_DIR + `${NETWORK}.json`;
// plan continues from a real pool if one exists, else from deploy's planned genesis; dry from deploy's dry run
const DEP_PATH = MODE === 'live' || (MODE === 'plan' && existsSync(REAL_DEP)) ? REAL_DEP : HERE + `build/${NETWORK}.${MODE}.json`;
const DEP = readJson(DEP_PATH);
if (DEP.network !== NETWORK) throw new Error(`${DEP_PATH} is for ${DEP.network}`);
if (MODE !== 'live') { if (DEP_PATH === REAL_DEP) net.resetLocalChain(); else net.restoreLocalChain(HERE + `build/${NETWORK}.${MODE}-chain.deploy.json`); }
const OUT = outPath('-e2e');
const FEE_RATE = Number(process.env.FEE_RATE ?? 1.02);
if (FEE_RATE > MAX_FEE_RATE || FEE_RATE < 1) throw new Error(`FEE_RATE must be in [1, ${MAX_FEE_RATE}]`);
const DEPOSIT = 200_000n, TO_B = 150_000n, WITHDRAW = 100_000n;
const vk = DEP.verifier.vk;
const ok = (v) => { if (typeof v === 'string') throw new Error(v); return v; };
const hex = (b) => Buffer.from(b).toString('hex');

// the app's key derivation (src/lib/stealth.ts keysFromMnemonic: m/7777'/0'/i', 0 = scan, 1 = spend), inlined so this
// script does not depend on src/
function keysFromMnemonic(words) {
  const root = ok(libauth.deriveHdPrivateNodeFromSeed(ok(libauth.deriveSeedFromBip39Mnemonic(words))));
  const key = (i) => ok(libauth.deriveHdPath(root, `m/7777'/0'/${i}'`)).privateKey;
  const scanPriv = key(0), spendPriv = key(1);
  return {scanPriv, scanPub: ok(libauth.secp256k1.derivePublicKeyCompressed(scanPriv)), spendPriv};
}
await S.ready();
const party = async (words) => { const k = keysFromMnemonic(words); return {...k, shield: await S.shieldKeys(k.spendPriv)}; };
// the leftover notes must stay ours on mainnet, so A and B come from mnemonics in .keys (BIP39 test vectors on chipnet only)
const WALLETS = `${KEYS}${NETWORK}-e2e-wallets.json`;
const words = existsSync(WALLETS) ? readJson(WALLETS) : NETWORK === 'chipnet' ? {A: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', B: 'legal winner thank year wave sausage worth useful legal winner thank yellow'} : null;
if (!words) throw new Error('missing ' + WALLETS);
const A = await party(words.A);
const B = await party(words.B);
const key = fundingKey();
log(`${NETWORK} (${MODE}) pool ${DEP.pool.address}, server ${(await net.connect()).host}, height ${await net.height()}`);

async function sync() {
  const tree = new S.CommitmentTree(), nulls = new S.NullifierTree();
  const notes = [];   // {owner, amount, blinding, leafIndex, C}
  const history = await net.listHistory(DEP.pool.address);
  const txs = new Map();
  for (const hrow of history) txs.set(hrow.tx_hash, await net.getTx(hrow.tx_hash));
  let cur = {txid: DEP.genesisTxid, value: BigInt(DEP.pool.initialValue), S: DEP.pool.sGenesis};
  let verifiers = DEP.verifier.outpoints.map((o) => ({txid: o.txid, vout: o.vout, value: BigInt(o.value)}));
  const steps = [];
  for (;;) {
    let next = null;
    for (const [txid, raw] of txs) { if (txid === cur.txid) continue; let q; try { q = T.poolFromTx(raw); } catch { continue; }
      if (q.spentPool.txid === cur.txid && q.spentPool.vout === 0) { next = {txid, q}; break; } }
    if (!next) break;
    const {q} = next;
    if (hex(q.S0) !== cur.S) throw new Error('history S0 mismatch at ' + next.txid);
    const n0 = tree.n; tree.appendPair(S.bytesToBig(q.C0), S.bytesToBig(q.C1));
    for (const N of [q.N0, q.N1]) { const v = S.bytesToBig(N); if (v !== 0n) nulls.insert(v); }
    for (const [j, ct, C] of [[0, q.ext.ct0, q.C0], [1, q.ext.ct1, q.C1]]) for (const [name, p] of [['A', A], ['B', B]]) {
      const Sh = ok(libauth.secp256k1.mulTweakPublicKeyCompressed(ct.slice(0, 33), p.scanPriv));
      const got = await S.ctOpen({ct, S: Sh, pk: p.shield.shieldPk, commitment: S.bytesToBig(C)});
      if (got) notes.push({owner: name, amount: got.amount, blinding: got.blinding, leafIndex: n0 + j, C: S.bytesToBig(C)});
    }
    const publicAmount = q.publicAmount ?? q.poolValue - cur.value;
    steps.push({txid: next.txid, publicAmount, poolValue: q.poolValue});
    verifiers = q.verifierOutpoints.map((o) => ({txid: next.txid, vout: o.vout, value: o.value}));
    cur = {txid: next.txid, value: q.poolValue, S: hex(q.S1)};
  }
  const keyOf = (o) => (o === 'A' ? A : B);
  const unspent = notes.filter((n) => n.amount > 0n && !nulls.has(S.nullifier(keyOf(n.owner).shield.shieldSk, n.C, n.leafIndex)));
  if (hex(S.feBytes(S.stateHash(tree.root, tree.n, nulls.root))) !== cur.S) throw new Error('rebuilt trees do not hash to the pool commitment');
  return {tree, nulls, notes: unspent, steps, pool: {txid: cur.txid, vout: 0, value: cur.value, lockHex: DEP.pool.lockHex, token: {category: DEP.category, nft: {capability: 'mutable', commitment: cur.S}}}, verifiers};
}

// one output note for a party: fresh e, S = e*scanPub, ct, blinding from S (spec section 8)
async function output(to, amount) {
  let e; do { e = crypto.getRandomValues(new Uint8Array(32)); } while (!libauth.secp256k1.validatePrivateKey(e));
  const E = ok(libauth.secp256k1.derivePublicKeyCompressed(e)); const Sh = ok(libauth.secp256k1.mulTweakPublicKeyCompressed(to.scanPub, e));
  const ct = await S.ctEncrypt({S: Sh, E, amount}); const {blinding} = await S.ctDerive(Sh);
  return {note: {amount, pk: to.shield.shieldPk, blinding}, ct};
}

async function step(name, st, {by, inputs, outs, publicAmount, recipientLock, payout = 0n, fee = 0n, deposit}) {
  const o = await Promise.all(outs.map(([p, amt]) => output(p, amt)));
  const extData = {recipientLock: recipientLock ?? new Uint8Array(), payout, fee, ct0: o[0].ct, ct1: o[1].ct};
  const w = await S.buildTransactWitness({tree: st.tree, nulls: st.nulls, shieldSk: by?.shield.shieldSk ?? 0n, inputs, publicAmount, extData, outputs: [o[0].note, o[1].note]});
  const t0 = Date.now(); const wtns = {type: 'mem'}; await snarkjs.wtns.calculate(w.input, WASM, wtns);
  const {proof, publicSignals} = await snarkjs.groth16.prove(ZKEY, wtns); const proveMs = Date.now() - t0;
  if (!(await snarkjs.groth16.verify(vk, publicSignals, proof))) throw new Error(name + ': proof does not verify');
  log(`${name}: proof ok (${proveMs} ms)`);
  const pieces = {S1: S.feBytes(w.post.S), publicAmount, C0: S.feBytes(w.commitments[0]), C1: S.feBytes(w.commitments[1]), N0: S.feBytes(w.nullifiers[0]), N1: S.feBytes(w.nullifiers[1]), extData: w.extData};
  const args = {deployment: DEP, poolUtxo: st.pool, verifierUtxos: st.verifiers, proof, publicSignals, pieces, feeRate: FEE_RATE};
  if (deposit) Object.assign(args, {fundingUtxos: [deposit.utxo], changeLock: hex(key.lock), signFunding: (tx, so, i) => { const c = structuredClone(tx); signP2pkh(c, so, i, key.priv); return c.inputs[i].unlockingBytecode; }});
  const built = await T.buildShieldTx(args);
  const r = await broadcastChecked({transaction: built.transaction, sourceOutputs: built.sourceOutputs}, name, key.lock);
  const v = verifyTx({transaction: built.transaction, sourceOutputs: built.sourceOutputs}, {metrics: true});
  const row = {name, txid: r.txid, size: built.size, fee: built.fee, satPerByte: +(Number(built.fee) / built.size).toFixed(3), publicAmount, proveMs,
    inputs: v.inputs.map((x) => ({unlockingBytes: x.unlockingBytes, opStandard: x.opStandard, budget: x.budget, marginPct: x.marginPct}))};
  return row;
}

const rec = MODE === 'live' && existsSync(OUT) ? readJson(OUT) : {network: NETWORK, mode: MODE, pool: DEP.pool.address, genesisTxid: DEP.genesisTxid, steps: []};
const done = (n) => rec.steps.some((s) => s.name === n);
const save = () => writeJson(OUT, rec);
const feeFor = (extLen, payoutLen) => BigInt(Math.ceil(T.shieldTxSize({deployment: DEP, extDataLength: extLen, payoutLockLength: payoutLen}) * FEE_RATE));

setFundingBudget((await net.listUnspent(key.address)).filter((u) => !u.token_data).reduce((a, u) => a + BigInt(u.value), 0n));
try {
  if (!done('deposit')) {
    const st = await sync();
    const us = (await waitForFunds(key.address, DEPOSIT + 40_000n)).map((u) => coinOf(u, key.lock)).filter((c) => c.value >= DEPOSIT + 40_000n).sort((a, b) => (a.value > b.value ? 1 : -1));
    const c = us[0]; if (!c) throw new Error('no single funding coin >= ' + (DEPOSIT + 40_000n));
    rec.steps.push(await step('deposit', st, {by: null, inputs: [], outs: [[A, DEPOSIT], [A, 0n]], publicAmount: DEPOSIT,
      deposit: {utxo: {txid: hex(c.txid), vout: c.vout, value: c.value, lockHex: hex(key.lock)}}})); save();
  }
  if (!done('transfer')) {
    const st = await waitSynced(1); const nA = st.notes.find((n) => n.owner === 'A'); if (!nA) throw new Error('A has no note');
    const fee = feeFor(101, 0);
    rec.steps.push(await step('transfer', st, {by: A, inputs: [nA], outs: [[B, TO_B], [A, nA.amount - TO_B - fee]], publicAmount: -fee, fee})); save();
  }
  if (!done('withdraw')) {
    const st = await waitSynced(2); const nB = st.notes.find((n) => n.owner === 'B'); if (!nB) throw new Error('B has no note');
    const fee = feeFor(1 + key.lock.length + 100, key.lock.length);
    rec.steps.push(await step('withdraw', st, {by: B, inputs: [nB], outs: [[B, nB.amount - WITHDRAW - fee], [B, 0n]], publicAmount: -(WITHDRAW + fee), recipientLock: key.lock, payout: WITHDRAW, fee})); save();
  }
  const fin = await waitSynced(3);
  rec.final = {poolTxid: fin.pool.txid, poolValue: fin.pool.value, notes: fin.notes.map((n) => ({owner: n.owner, amount: n.amount, leafIndex: n.leafIndex})), syncedSteps: fin.steps.length};
  rec.passed = true; save();
  log('E2E PASSED', JSON.stringify(rec.final, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
} catch (e) {
  rec.lastError = {at: new Date().toISOString(), message: String(e.message ?? e), reject: e.reject ?? null}; save();
  log('E2E FAILED:', e.message ?? e); if (e.txHex) writeJson(OUT.replace(/\.json$/, '.failed-tx.json'), {hex: e.txHex});
  process.exitCode = 1;
}
// a just-broadcast tx can take a moment to show in the address history
async function waitSynced(n) { for (let i = 0; i < 40; i++) { const st = await sync(); if (st.steps.length >= n) return st; if (MODE !== 'live') break; await sleep(3000); } throw new Error('pool history did not reach step ' + n); }
await net.close(); process.exit(process.exitCode ?? 0);
