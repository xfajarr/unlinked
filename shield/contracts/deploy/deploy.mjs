// Genesis of the Unlinked Shield pool: an output-0 funding coin (its txid is the category), the verifier built for that
// category with the real key, then the pool NFT (S_genesis = Poseidon(Rc_empty, 0, Rn_empty)) and 3 verifier coins.
//   NETWORK=chipnet node deploy/deploy.mjs              broadcasts
//   NETWORK=mainnet node deploy/deploy.mjs              plan: real UTXOs, exact txs, VM check, nothing sent
//   NETWORK=mainnet BROADCAST=1 node deploy/deploy.mjs  broadcasts (the user runs this)
//   DRY_RUN=1 NETWORK=... node deploy/deploy.mjs        fake funding, local chain
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fundingKey, coinOf, broadcastChecked, waitForFunds, writeJson, readJson, existsSync, net, log, HERE, SHIELD, addressOf, setFundingBudget, outPath, NETWORK, MODE} from './common.mjs';
import {signP2pkh, sourceOf, inputOf, outputOf, libauth} from '../pool.mjs';
import {loadVerifier, poolTokenOf, vkFixturesFromSnarkjs} from '../verifier/verifier.mjs';
import {genesisTx, POOL_START_SATS, VERIFIER_SATS} from '../genesis.mjs';
import * as S from '../../lib/src/index.ts';

const OUT = outPath('');
const VK_PATH = SHIELD + 'circuits/build/verification_key.json';
const MIN_FUNDS = BigInt(process.env.MIN_FUNDS ?? 400000); // genesis plus the e2e (deposit 200k and its fee)
if (MODE === 'live' && existsSync(OUT) && !process.env.FORCE) { log(`${OUT} exists; FORCE=1 to deploy another pool`); process.exit(0); }

const key = fundingKey();
log(`${NETWORK} (${MODE}) funding address ${key.address}`);
if (MODE !== 'live') net.resetLocalChain();
let coins;
if (MODE === 'dry') coins = [{tx_hash: createHash('sha256').update('dry funding').digest('hex'), tx_pos: 1, value: 1_000_000}];
else { log('server', (await net.connect()).host); coins = await waitForFunds(key.address, MIN_FUNDS); }
setFundingBudget(coins.reduce((a, u) => a + BigInt(u.value), 0n));

// a token genesis must spend output index 0
let fund = coins.map((u) => coinOf(u, key.lock)).filter((c) => c.vout === 0).sort((a, b) => (b.value > a.value ? 1 : -1))[0];
if (!fund || fund.value < MIN_FUNDS - 2000n) {
  const ins = coins.map((u) => coinOf(u, key.lock));
  const total = ins.reduce((a, c) => a + c.value, 0n);
  const mk = (fee) => { const t = {version: 2, locktime: 0, inputs: ins.map((c) => inputOf(c)), outputs: [outputOf({lock: key.lock, value: total - fee})]};
    const so = ins.map(sourceOf); ins.forEach((_, i) => signP2pkh(t, so, i, key.priv)); return {transaction: t, sourceOutputs: so}; };
  const size = libauth.encodeTransaction(mk(1000n).transaction).length; const b = mk(BigInt(size + 10));
  const r = await broadcastChecked(b, 'self-send to output 0', key.lock);
  fund = {txid: Buffer.from(r.txid, 'hex'), vout: 0, value: b.transaction.outputs[0].valueSatoshis, lock: key.lock};
}
const category = fund.txid.toString('hex');
log('funding coin', `${category}:0`, fund.value, 'sat = category');

const vk = JSON.parse(readFileSync(VK_PATH, 'utf8'));
const fxPath = HERE + `build/${NETWORK}.fixtures.json`;
writeJson(fxPath, vkFixturesFromSnarkjs(vk));
const V = await loadVerifier(fxPath);
const prog = V.buildCached(poolTokenOf(category), HERE + `build/${NETWORK}-${MODE}.build.json`);
log('verifier', prog.json.codeBytes, 'B code');

await S.ready();
const sGen = S.feBytes(S.genesisState());
const fixtureGenesis = readJson(SHIELD + 'fixtures/chain.json').genesis.S;
if (Buffer.from(sGen).toString('hex') !== fixtureGenesis) throw new Error('S_genesis differs from fixtures/chain.json');
const mkGen = (fee) => { const g = genesisTx({funding: fund, sGenesis: Buffer.from(sGen), verifierLock: prog.locking, changeLock: key.lock, fee}); signP2pkh(g.transaction, g.sourceOutputs, 0, key.priv); return g; };
const gsize = libauth.encodeTransaction(mkGen(1000n).transaction).length;
const G = mkGen(BigInt(Math.ceil(gsize * 1.05)));
const r = await broadcastChecked(G, 'genesis', key.lock);

const zkeySha256 = readFileSync(SHIELD + 'circuits/build/transact_final.zkey.sha256', 'utf8').trim().split(/\s+/)[0];
const verifierAddress = addressOf(prog.locking);
writeJson(OUT, {
  network: NETWORK,
  ...(MODE === 'live' ? {} : {mode: MODE, note: 'not broadcast'}),
  category,
  genesisTxid: r.txid,
  fundingOutpoint: `${category}:0`,
  pool: {address: addressOf(G.pool.lock), lockHex: G.pool.lock.toString('hex'), redeemHex: G.pool.redeem.toString('hex'), outpoint: {txid: r.txid, vout: 0}, initialValue: POOL_START_SATS,
    poolTokenHex: poolTokenOf(category).toString('hex'), sGenesis: fixtureGenesis},
  verifier: {address: verifierAddress, addresses: [verifierAddress], lockHex: prog.locking.toString('hex'), redeemHex: prog.json.redeemHex, codePiecesHex: prog.json.codePiecesHex,
    codeSha256: prog.json.codeSha256, outpoints: [1, 2, 3].map((vout) => ({txid: r.txid, vout, value: VERIFIER_SATS})), vk},
  zkeySha256,
  vkSha256: createHash('sha256').update(readFileSync(VK_PATH)).digest('hex'),
  layout: 'spec 9.1: inputs 0-2 verifiers, 3 pool, 4.. funding; outputs 0 pool, 1 payout (if > 0), 3 verifiers, change (deposit only)',
  createdAt: new Date().toISOString(),
});
if (MODE !== 'live') net.snapshotLocalChain(HERE + `build/${NETWORK}.${MODE}-chain.deploy.json`);
log('wrote', OUT);
await net.close();
process.exit(0);
