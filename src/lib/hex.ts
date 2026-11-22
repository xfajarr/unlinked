// Hex helpers without libauth (libauth instantiates WebAssembly at import time, which the Workers runtime forbids).
export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
export const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16))
