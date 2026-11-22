// Byte helpers without node APIs (no Buffer): Uint8Array only.
import {sha256 as nobleSha256} from '@noble/hashes/sha2.js';

export const sha256 = (b) => nobleSha256(b);
export const utf8 = (s) => new TextEncoder().encode(s);
export function cat(parts) {
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export const concat = (...parts) => cat(parts);
export const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export function fromHex(h) {
  if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error('bad hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}
export const equal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
export const reverse = (b) => Uint8Array.from(b).reverse();
export const beToBig = (b) => (b.length ? BigInt('0x' + toHex(b)) : 0n);
export function bigToBe(x, n) {
  if (x < 0n || x >= 1n << BigInt(8 * n)) throw new Error('out of range');
  return fromHex(x.toString(16).padStart(2 * n, '0'));
}
export const u64be = (x) => bigToBe(x, 8);
export const i64be = (x) => { if (x < -(1n << 63n) || x >= 1n << 63n) throw new Error('i64 range'); return u64be(x < 0n ? x + (1n << 64n) : x); };
export const i64FromBe = (b) => { const u = beToBig(b); return u >= 1n << 63n ? u - (1n << 64n) : u; };

// minimal data push, byte-identical to libauth's encodeDataPush (consensus minimal-push rules)
export function pushData(data) {
  const n = data.length;
  if (n === 0) return Uint8Array.of(0);
  if (n === 1 && data[0] !== 0 && data[0] <= 16) return Uint8Array.of(data[0] + 80);
  if (n === 1 && data[0] === 0x81) return Uint8Array.of(0x4f);
  const hdr = n <= 75 ? [n] : n <= 255 ? [0x4c, n] : n <= 65535 ? [0x4d, n & 255, n >> 8] : [0x4e, n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];
  const out = new Uint8Array(hdr.length + n); out.set(hdr, 0); out.set(data, hdr.length); return out;
}
export const pushLen = (n) => (n === 0 ? 1 : n <= 75 ? n + 1 : n <= 255 ? n + 2 : n <= 65535 ? n + 3 : n + 5);
export const encodePushes = (items) => cat(items.map(pushData));
// decode a push-only bytecode into its data items (throws on any non-push opcode)
export function decodePushes(b) {
  const out = []; let i = 0;
  while (i < b.length) {
    const op = b[i++]; let n;
    if (op === 0) { out.push(new Uint8Array(0)); continue; }
    if (op >= 0x51 && op <= 0x60) { out.push(Uint8Array.of(op - 80)); continue; }
    if (op === 0x4f) { out.push(Uint8Array.of(0x81)); continue; }
    if (op <= 75) n = op;
    else if (op === 0x4c) n = b[i++];
    else if (op === 0x4d) { n = b[i] | (b[i + 1] << 8); i += 2; }
    else if (op === 0x4e) { n = (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 2 ** 24; i += 4; }
    else throw new Error('not push-only: opcode 0x' + op.toString(16));
    if (i + n > b.length) throw new Error('push past end');
    out.push(b.subarray(i, i + n)); i += n;
  }
  return out;
}
