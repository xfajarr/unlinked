// Fulcrum access for NETWORK=chipnet|mainnet, with an address-prefix guard.
// Modes: live; plan (mainnet without BROADCAST=1: live reads plus a local overlay that records would-be broadcasts, so
// every step builds against real UTXOs and nothing is sent); dry (DRY_RUN=1: a purely local chain).
import {readFileSync, writeFileSync, existsSync, rmSync, copyFileSync} from 'node:fs';
import {ElectrumClient} from '@electrum-cash/network';
import {libauth} from '../pool.mjs';

export const NETWORK = process.env.NETWORK ?? 'chipnet';
const CFG = {
  // same servers as src/lib/config.ts
  mainnet: {prefix: 'bitcoincash', servers: ['bch.loping.net', 'fulcrum.greyh.at', 'electrum.imaginary.cash', 'fulcrum.criptolayer.net']},
  chipnet: {prefix: 'bchtest', servers: ['chipnet.bch.ninja', 'chipnet.imaginary.cash']},
};
if (!CFG[NETWORK]) throw new Error('NETWORK must be mainnet or chipnet');
export const PREFIX = CFG[NETWORK].prefix, SERVERS = CFG[NETWORK].servers;
export const MODE = process.env.DRY_RUN ? 'dry' : NETWORK === 'mainnet' && process.env.BROADCAST !== '1' ? 'plan' : 'live';
export const guard = (addr) => { if (!addr.startsWith(PREFIX + ':')) throw new Error(`${NETWORK}: refusing address ${addr}`); return addr; };

let client = null, next = 0;
async function liveConnect() {
  if (client) return client;
  let last;
  for (let k = 0; k < SERVERS.length; k++) {
    const host = SERVERS[(next + k) % SERVERS.length];
    try { const c = new ElectrumClient('unlinked-shield', '1.4.1', host); await c.connect(); client = c; client.host = host; return c; } catch (e) { last = e; }
  }
  throw last;
}
const dropClient = async () => { const c = client; client = null; next++; if (c) { try { await c.disconnect(true); } catch {} } };
// transport failures reconnect on the next server; a node's answer (e.g. a reject) is final
const TRANSPORT = /connection lost|not connected|timed? ?out|socket|ECONN|closed|disconnect/i;
async function req(m, ...a) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try { const c = await liveConnect(); r = await c.request(m, ...a); } catch (e) { r = e instanceof Error ? e : new Error(String(e)); }
    if (!(r instanceof Error)) return r;
    if (!TRANSPORT.test(r.message) || attempt >= 5 || (m === 'blockchain.transaction.broadcast' && attempt >= 1)) throw r;
    await dropClient(); await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
  }
}
const live = {
  listUnspent: (addr) => req('blockchain.address.listunspent', guard(addr), 'include_tokens'),
  listHistory: (addr) => req('blockchain.address.get_history', guard(addr)),
  getTx: (txid) => req('blockchain.transaction.get', txid),
  broadcast: (hex) => req('blockchain.transaction.broadcast', hex),
  height: async () => (await req('blockchain.headers.get_tip')).height,
};

const STORE = new URL(`../build/${NETWORK}.${MODE}-chain.json`, import.meta.url).pathname;
const load = () => (existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : {txs: {}});
export const resetLocalChain = () => rmSync(STORE, {force: true});
export const snapshotLocalChain = (to) => { if (existsSync(STORE)) copyFileSync(STORE, to); };
export const restoreLocalChain = (from) => { if (existsSync(from)) copyFileSync(from, STORE); else resetLocalChain(); };
const lockOf = (addr) => { const r = libauth.cashAddressToLockingBytecode(guard(addr)); if (typeof r === 'string') throw new Error(r); return libauth.binToHex(r.bytecode); };
const row = (txid, n, o) => ({tx_hash: txid, tx_pos: n, value: Number(o.valueSatoshis), height: 0,
  ...(o.token ? {token_data: {amount: o.token.amount.toString(), category: libauth.binToHex(o.token.category), ...(o.token.nft ? {nft: {capability: o.token.nft.capability, commitment: libauth.binToHex(o.token.nft.commitment)}} : {})}} : {})});
function localView(addr) {
  const want = lockOf(addr); const outs = [], spent = new Set(), hist = [];
  for (const [txid, hex] of Object.entries(load().txs)) {
    const tx = libauth.decodeTransaction(libauth.hexToBin(hex));
    tx.inputs.forEach((i) => spent.add(libauth.binToHex(i.outpointTransactionHash) + ':' + i.outpointIndex));
    let mine = false;
    tx.outputs.forEach((o, n) => { if (libauth.binToHex(o.lockingBytecode) === want) { mine = true; outs.push(row(txid, n, o)); } });
    if (mine) hist.push({tx_hash: txid, height: 0});
  }
  return {outs, spent, hist};
}
const local = {
  listUnspent: async (addr) => {
    const v = localView(addr); const base = MODE === 'plan' ? await live.listUnspent(addr) : [];
    return [...base, ...v.outs].filter((u) => !v.spent.has(u.tx_hash + ':' + u.tx_pos));
  },
  listHistory: async (addr) => [...(MODE === 'plan' ? await live.listHistory(addr) : []), ...localView(addr).hist],
  getTx: async (txid) => load().txs[txid] ?? (MODE === 'plan' ? live.getTx(txid) : null),
  broadcast: async (hex) => { const m = load(); const txid = libauth.hashTransaction(libauth.hexToBin(hex)); m.txs[txid] = hex; writeFileSync(STORE, JSON.stringify(m)); return txid; },
  height: async () => (MODE === 'plan' ? live.height() : 0),
};

const B = MODE === 'live' ? live : local;
export const connect = async () => (MODE === 'dry' ? {host: 'dry run (local chain)'} : {host: (await liveConnect()).host + (MODE === 'plan' ? ' (plan: nothing is broadcast)' : '')});
export const listUnspent = (a) => B.listUnspent(a);
export const listHistory = (a) => B.listHistory(a);
export const getTx = (t) => B.getTx(t);
export const broadcast = (h) => B.broadcast(h);
export const height = () => B.height();
export async function close() { if (client) { try { await client.disconnect(true); } catch {} client = null; } }
