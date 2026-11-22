import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {libauth, p2pkhLock, pubOf, verifyTx} from '../pool.mjs';
import * as net from './net.mjs';

export const {NETWORK, MODE, PREFIX} = net;
export const HERE = new URL('../', import.meta.url).pathname;           // shield/contracts/
export const SHIELD = new URL('../../', import.meta.url).pathname;
export const DEPLOY_DIR = SHIELD + 'deployments/';
export const KEYS = HERE + '.keys/';
export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
export const MAX_TX_FEE = 50_000n;
export const MAX_FEE_RATE = NETWORK === 'mainnet' ? 1.1 : 2;
const CHIPNET_FUNDING = 'bchtest:qrlq9zkwmztwk9wcqlhedqnuzlxgrp4lx5vy3w7ypx';

export function addressOf(lock) {
  const r = libauth.lockingBytecodeToCashAddress({bytecode: Uint8Array.from(lock), prefix: PREFIX});
  if (typeof r === 'string') throw new Error(r);
  return net.guard(r.address ?? r);
}
export function fundingKey() {
  const k = JSON.parse(readFileSync(`${KEYS}${NETWORK}-funding.json`, 'utf8'));
  if (k.network !== NETWORK) throw new Error(`key file is for ${k.network}, not ${NETWORK}`);
  const priv = Buffer.from(k.priv, 'hex'); const lock = p2pkhLock(pubOf(priv)); const address = addressOf(lock);
  if (NETWORK === 'chipnet' && address !== CHIPNET_FUNDING) throw new Error('funding key does not match ' + CHIPNET_FUNDING);
  return {priv, lock, address};
}
export const coinOf = (u, lock) => ({txid: Buffer.from(u.tx_hash, 'hex'), vout: u.tx_pos, value: BigInt(u.value), lock,
  ...(u.token_data ? {token: {amount: BigInt(u.token_data.amount ?? 0), category: Buffer.from(u.token_data.category, 'hex'),
    ...(u.token_data.nft ? {nft: {capability: u.token_data.nft.capability, commitment: Buffer.from(u.token_data.nft.commitment ?? '', 'hex')}} : {})}} : {})});

// the funding key may never spend more than it held when the script started
let budget = null, spent = 0n;
export const setFundingBudget = (sats) => { budget = BigInt(sats); };
const lockSum = (outs, lock) => outs.reduce((a, o) => a + (Buffer.from(o.lockingBytecode).equals(lock) ? o.valueSatoshis : 0n), 0n);

// local BCH 2026 VM check and the mainnet caps first; then broadcast (live), record (plan / dry) and wait until seen
export async function broadcastChecked(built, label, fundingLock) {
  const v = verifyTx(built);
  if (!v.accepted) throw new Error(`${label}: local VM rejects: ${JSON.stringify(v.verdict)}`);
  const enc = libauth.encodeTransaction(built.transaction);
  const hex = libauth.binToHex(enc), txid = libauth.hashTransaction(enc), size = enc.length;
  const fee = built.sourceOutputs.reduce((a, o) => a + o.valueSatoshis, 0n) - built.transaction.outputs.reduce((a, o) => a + o.valueSatoshis, 0n);
  const rate = Number(fee) / size;
  if (fee > MAX_TX_FEE) throw new Error(`${label}: fee ${fee} above the ${MAX_TX_FEE} sat cap`);
  if (rate > MAX_FEE_RATE || rate < 1) throw new Error(`${label}: fee rate ${rate.toFixed(3)} sat/B outside [1, ${MAX_FEE_RATE}]`);
  if (fundingLock) {
    spent += lockSum(built.sourceOutputs, fundingLock) - lockSum(built.transaction.outputs, fundingLock);
    if (budget === null || spent > budget) throw new Error(`${label}: the funding key would spend ${spent} sat, more than the ${budget} it holds`);
  }
  let res;
  try { res = await net.broadcast(hex); } catch (e) {
    if (/already|known/i.test(String(e.message ?? e)) && await net.getTx(txid).catch(() => null)) res = txid; // retried after a dropped socket
    else { const err = new Error(`${label}: node REJECTED: ${e.message ?? e}`); err.reject = String(e.message ?? e); err.txHex = hex; throw err; }
  }
  if (res !== txid) throw new Error(`${label}: broadcast returned ${JSON.stringify(res)} (expected ${txid})`);
  for (let i = 0; MODE === 'live' && i < 20; i++) { try { if (await net.getTx(txid)) break; } catch {} await sleep(3000); }
  log(`${label}: ${MODE === 'live' ? 'BROADCAST' : MODE === 'plan' ? 'PLANNED (not broadcast)' : 'DRY'} ${txid} ${size} B fee ${fee} (${rate.toFixed(3)} sat/B)`);
  return {txid, hex, size, fee};
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitForFunds(address, minSats, everyMs = 30000) {
  for (;;) {
    let us;
    try { us = (await net.listUnspent(address)).filter((u) => !u.token_data); } catch (e) { log('poll failed, retrying:', e.message ?? e); await sleep(everyMs); continue; }
    const total = us.reduce((a, u) => a + BigInt(u.value), 0n);
    if (total >= minSats) return us;
    log(`waiting for funds at ${address}: have ${total} sat, need ${minSats}`);
    await sleep(everyMs);
  }
}
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export function writeJson(p, o) { mkdirSync(DEPLOY_DIR, {recursive: true}); writeFileSync(p, JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 1) + '\n'); }
export const outPath = (name) => (MODE === 'live' ? DEPLOY_DIR : HERE + 'build/') + `${NETWORK}${name}${MODE === 'live' ? '' : '.' + MODE}.json`;
export {net, existsSync};
