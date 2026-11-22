// TEST ONLY. Groth16 proofs for ANY statement (s0, h) under the free-statement stand-in key. Never deploy this key.
import * as snarkjs from 'snarkjs';
const B = new URL('./build/', import.meta.url).pathname;
export const STANDIN_VK = B + 'verification_key.json';
export async function proveFree(s0, h) {
  const {proof, publicSignals} = await snarkjs.groth16.fullProve({s0: s0.toString(), h: h.toString()}, B + 'free_statement_js/free_statement.wasm', B + 'fs_final.zkey');
  if (publicSignals[0] !== s0.toString() || publicSignals[1] !== h.toString()) throw new Error('public signal order is not [s0, h]');
  return {proof, publicSignals};
}
export const verifyFree = async (vk, publicSignals, proof) => snarkjs.groth16.verify(vk, publicSignals, proof);
// snarkjs keeps a worker pool alive; call once at the end so the process can exit
export async function shutdown() { for (const k of ['curve_bn128', 'curve_bls12381']) if (globalThis[k]) { await globalThis[k].terminate(); delete globalThis[k]; } }
