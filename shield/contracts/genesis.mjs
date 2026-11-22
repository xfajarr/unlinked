// Genesis of an Unlinked Shield pool: one transaction that creates the pool coin (CashTokens genesis of a single
// mutable NFT, commitment S_genesis) and the three verifier coins.
//
// Order of operations (the pool and the verifier both depend on the category, and the category is the txid of the
// outpoint that the genesis transaction spends at input 0, which must have output index 0):
//   1. pick a funding coin at <txid>:0. category = txid
//   2. node verifier/build.mjs <verification_key.json> <txid> <out.build.json>  -> verifier lock (binds the category)
//   3. pool lock = P2SH32(ShieldPool(verifierLock, poolToken(category)))
//   4. genesisTx(...), sign the funding input, broadcast
//
// CLI (offline: prints the signed transaction, never broadcasts):
//   FUNDING_KEY=<hex> node genesis.mjs <verifier build.json> <fundingTxid> <fundingSats> <S_genesis hex> [poolSats] [verifierSats] [feeSats]
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {poolContract, poolTokenData, p2pkhLock, pubOf, signP2pkh, sourceOf, inputOf, outputOf, verifyTx, libauth} from './pool.mjs';
import {poolTokenOf} from './verifier/verifier.mjs';

export const POOL_START_SATS = 1000n, VERIFIER_SATS = 1000n;

// funding: {txid (UI order), vout: 0, value, lock}; returns the unsigned {transaction, sourceOutputs} and the coins
export function genesisTx({funding, sGenesis, verifierLock, poolValue = POOL_START_SATS, verifierValue = VERIFIER_SATS, changeLock, fee}) {
  assert.equal(funding.vout, 0, 'a token genesis input must spend output index 0');
  assert.equal(sGenesis.length, 32);
  const category = Buffer.from(funding.txid);
  const pool = poolContract(verifierLock, poolTokenOf(category.toString('hex')));
  const change = BigInt(funding.value) - BigInt(poolValue) - 3n * BigInt(verifierValue) - BigInt(fee);
  assert.ok(change >= 1000n, 'funding too small');
  const outputs = [
    {lock: pool.lock, value: poolValue, token: poolTokenData(category, sGenesis)},
    ...[0, 1, 2].map(() => ({lock: verifierLock, value: verifierValue})),
    {lock: changeLock, value: change},
  ];
  const transaction = {version: 2, locktime: 0, inputs: [inputOf(funding)], outputs: outputs.map(outputOf)};
  return {transaction, sourceOutputs: [sourceOf(funding)], category, pool, outputs};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [buildPath, txidHex, sats, sGenHex, poolSats, verifierSats, feeSats] = process.argv.slice(2);
  const key = process.env.FUNDING_KEY;
  if (!key || !sGenHex) throw new Error('usage: FUNDING_KEY=<hex> node genesis.mjs <verifier build.json> <fundingTxid> <fundingSats> <S_genesis hex> [poolSats] [verifierSats] [feeSats]');
  const build = JSON.parse(readFileSync(buildPath, 'utf8'));
  if (build.poolTokenHex !== poolTokenOf(txidHex).toString('hex')) throw new Error('the verifier build binds another category: rebuild it for this funding txid');
  const priv = Buffer.from(key, 'hex'), lock = p2pkhLock(pubOf(priv));
  const g = genesisTx({funding: {txid: Buffer.from(txidHex, 'hex'), vout: 0, value: BigInt(sats), lock}, sGenesis: Buffer.from(sGenHex, 'hex'),
    verifierLock: Buffer.from(build.lockingHex, 'hex'), poolValue: BigInt(poolSats ?? POOL_START_SATS), verifierValue: BigInt(verifierSats ?? VERIFIER_SATS), changeLock: lock, fee: BigInt(feeSats ?? 1000)});
  signP2pkh(g.transaction, g.sourceOutputs, 0, priv);
  const v = verifyTx(g);
  console.log(JSON.stringify({poolAddress: g.pool.address, poolLockHex: g.pool.lock.toString('hex'), category: txidHex, verifierLockHex: build.lockingHex,
    vmVerdict: v.verdict, txBytes: v.txBytes, rawTx: libauth.binToHex(libauth.encodeTransaction(g.transaction))}, null, 1));
}
