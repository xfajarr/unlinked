// Creates .keys/<NETWORK>-funding.json ({network, priv}) and .keys/<NETWORK>-e2e-wallets.json (mnemonics A, B), mode 600.
// Prints only the funding address. Never overwrites an existing key.
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {libauth, p2pkhLock, pubOf} from '../pool.mjs';
import {KEYS, NETWORK, addressOf} from './common.mjs';

mkdirSync(KEYS, {recursive: true, mode: 0o700});
const write = (path, obj) => { if (existsSync(path)) return false; writeFileSync(path, JSON.stringify(obj) + '\n', {mode: 0o600, flag: 'wx'}); return true; };
let priv; do { priv = randomBytes(32); } while (!libauth.secp256k1.validatePrivateKey(priv));
write(`${KEYS}${NETWORK}-funding.json`, {network: NETWORK, priv: priv.toString('hex')});
const mn = () => { const r = libauth.generateBip39Mnemonic(); if (typeof r !== 'string') throw new Error('mnemonic'); return r; };
write(`${KEYS}${NETWORK}-e2e-wallets.json`, {network: NETWORK, A: mn(), B: mn()});
const {fundingKey} = await import('./common.mjs');
console.log(fundingKey().address);
