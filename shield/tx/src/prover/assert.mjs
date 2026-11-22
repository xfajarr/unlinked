// Minimal browser stand-in for node:assert/strict (only what the ported prover uses).
const fail = (m) => { throw new Error('assertion failed' + (m ? ': ' + m : '')); };
const assert = (v, m) => { if (!v) fail(m); };
assert.ok = assert;
assert.equal = (a, b, m) => { if (a !== b) fail(m ?? `${a} !== ${b}`); };
assert.deepEqual = (a, b, m) => { if (JSON.stringify(a, (k, v) => (typeof v === 'bigint' ? v.toString() : v)) !== JSON.stringify(b, (k, v) => (typeof v === 'bigint' ? v.toString() : v))) fail(m ?? 'deepEqual'); };
export default assert;
