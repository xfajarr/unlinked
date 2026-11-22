// The 3 verifier unlockings for one Groth16 proof (port of bn-native-sound/transaction.mjs unlockingsFor), with
// CAP fillers instead of VM-measured ones: every input's unlocking is padded to exactly 10,000 B, the per-input cap.
// Upstream's cap rule (bn-native-sound README, Liveness) bounds the worst-case op cost of every input of every proof
// at <= 0.94 x 8,032,800, the budget of a 10,000 B unlocking, so a cap-filled transaction never needs a VM run to size.
// It also makes the transaction size independent of the proof, so a client can fix the fee before proving.
import {DS, proveCore, handovers, zOf, zTail} from './protocol.mjs';
import {cat, pushData, pushLen} from '../bytes.mjs';

export const UNLOCK_CAP = 10000;
export {proveCore};
export const encodeUnlocking = (pushes) => cat(pushes.map(pushData));

// prog: {R, pieces: [C_0, C_1]} (Uint8Array); fills: filler byte counts per input
export function unlockingsFor(core, prog, fills) {
  const z = zOf(core, zTail(fills[2], core.WQ)); const {H} = handovers(core, z);
  const F = fills.map((n) => new Uint8Array(n));
  const pushes = [
    [core.S[0], DS[0], prog.pieces[0], F[0], prog.R],
    [core.S[1], H[1], DS[1], prog.pieces[1], F[1], prog.R],
    [core.D, core.STMT, core.S[2], H[2], DS[2], F[2], core.WQ, prog.R],
  ];
  return {pushes, unlockings: pushes.map(encodeUnlocking), z, H};
}
// the largest filler per input that keeps the unlocking <= the cap (exactly the cap unless a push-header boundary
// makes it unreachable). Lengths only: no handover computation needed.
export function capFills(core, prog, cap = UNLOCK_CAP) {
  const items = [
    [core.S[0].length, DS[0].length, prog.pieces[0].length, prog.R.length],
    [core.S[1].length, 224, DS[1].length, prog.pieces[1].length, prog.R.length],
    [core.D.length, core.STMT.length, core.S[2].length, 224, DS[2].length, core.WQ.length, prog.R.length],
  ];
  return items.map((lens) => {
    const base = lens.reduce((s, n) => s + pushLen(n), 0);
    let f = Math.max(0, cap - base - 3);
    while (f > 0 && base + pushLen(f) > cap) f--;
    while (base + pushLen(f + 1) <= cap) f++;
    if (base + pushLen(f) > cap) throw new Error('verifier unlocking exceeds the cap without a filler');
    return f;
  });
}
