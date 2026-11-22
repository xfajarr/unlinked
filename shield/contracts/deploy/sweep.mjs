// Sends every BCH coin of the funding key to TO (a plain address on the same network).
//   NETWORK=mainnet TO=bitcoincash:q... node deploy/sweep.mjs              plan only: builds and VM-checks, sends nothing
//   NETWORK=mainnet TO=bitcoincash:q... BROADCAST=1 node deploy/sweep.mjs  broadcasts (the user runs this)
import {fundingKey, coinOf, broadcastChecked, net, log, setFundingBudget, NETWORK, MODE, PREFIX} from './common.mjs';
import {signP2pkh, sourceOf, inputOf, outputOf, libauth} from '../pool.mjs';

const TO = process.env.TO ?? '';
if (!TO.startsWith(PREFIX + ':')) throw new Error(`TO must be a ${PREFIX}: address`);
const dest = libauth.cashAddressToLockingBytecode(TO);
if (typeof dest === 'string') throw new Error(`TO: ${dest}`);

const key = fundingKey();
log(`${NETWORK} (${MODE}) sweep ${key.address} -> ${TO}`);
if (MODE !== 'live') net.resetLocalChain();
log('server', (await net.connect()).host);
// token coins are left alone so a sweep can never burn a CashToken
const coins = (await net.listUnspent(key.address)).filter((u) => !u.token_data).map((u) => coinOf(u, key.lock));
if (!coins.length) throw new Error('nothing to sweep');
const total = coins.reduce((a, c) => a + c.value, 0n);
setFundingBudget(total);

const mk = (fee) => {
  const t = {version: 2, locktime: 0, inputs: coins.map((c) => inputOf(c)), outputs: [outputOf({lock: dest.bytecode, value: total - fee})]};
  const so = coins.map(sourceOf);
  coins.forEach((_, i) => signP2pkh(t, so, i, key.priv));
  return {transaction: t, sourceOutputs: so};
};
const size = libauth.encodeTransaction(mk(1000n).transaction).length;
const built = mk(BigInt(size + 10));
const r = await broadcastChecked(built, `sweep ${coins.length} coin(s), ${total} sat`, key.lock);
log(MODE === 'live' ? 'sent' : 'planned', built.transaction.outputs[0].valueSatoshis, 'sat to', TO, 'txid', r.txid);
await net.close?.();
process.exit(0);
