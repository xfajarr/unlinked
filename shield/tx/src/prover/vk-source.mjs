// The VK the prover modules are evaluated for. math.mjs reads it ONCE at module evaluation (upstream reads a file
// named by BN_VK_FIXTURES), so set it before the first dynamic import of ./math.mjs and never change it afterwards.
let FIX = null;
export const VK_SOURCE = {
  set(vk) {
    const k = JSON.stringify(vk);
    if (FIX && FIX.key !== k) throw new Error('shield/tx: the prover is already loaded for another verification key (one key per page)');
    FIX = {key: k, fixtures: {vk, fixtures: []}};
  },
  get() { if (!FIX) throw new Error('shield/tx: VK_SOURCE.set(vk) must run before the prover loads'); return FIX.fixtures; },
};
