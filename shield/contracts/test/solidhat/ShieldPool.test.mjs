// ShieldPool on SolidHat's in-process mock network (`strict`: BCH input, stack-item, transaction and commitment
// limits, dust and standardness). Parameters are the mainnet deployment's (shield/deployments/mainnet.json), proofs
// are the real Groth16 proofs of shield/fixtures/chain.json, and every transaction is the full layout (3 verifier
// inputs, pool, funding), judged as a whole by the mock.
//
// Op-cost caveat: SolidCash's pinned libauth under-counts OP_DEFINE against BCHN (solidcash/solidcash#20,
// bitauth/libauth#166), so this mock can accept op costs mainnet would refuse. test/real-chain.test.mjs, on the
// patched libauth, stays the authority on op-cost margins.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { ethers, network } from '@solidcash/solidhat/hardhat3';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { Contract, FailedRequireError } from '@solidcash/solidcash';
import { loadVerifier, poolTokenOf, POOL_INPUT, N1_OFFSET } from '../../verifier/verifier.mjs';
import { libauth, firstFailure, MAX_FEE } from '../../pool.mjs';
import * as h from '../harness.mjs';

const SHIELD = h.HERE + '../';
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const mainnet = readJson(SHIELD + 'deployments/mainnet.json');
const chain = readJson(SHIELD + 'fixtures/chain.json');
const hex = (b) => Buffer.from(b).toString('hex');
const bin = (x) => Buffer.from(x, 'hex');
const i64 = (b) => { const u = h.fromBe(b); return u >= 2n ** 63n ? u - 2n ** 64n : u; };
const MINER_FEE = 30_000n; // at least 1 sat/B on a ~29 kB transaction, the mock's relay floor

let provider, artifact, pool, D, alice, bob;
const key = {};

// broadcast to the mock; when the mock refuses the pool input's script, the refusal is rethrown as SolidCash's
// FailedRequireError, naming the ShieldPool.scash line and statement (failing ip from pool.mjs's VM, mapped through
// the artifact's debug.requires), so the revert matchers assert the exact guard. Any other refusal is rethrown as
// the mock gave it.
async function send({ transaction, sourceOutputs }) {
  try {
    return await provider.sendRawTransaction(libauth.binToHex(libauth.encodeTransaction(transaction)));
  } catch (error) {
    if (!/script-verify-flag[\s\S]*input index 3:/.test(error.message)) throw error;
    const f = firstFailure({ transaction, sourceOutputs }, [POOL_INPUT]);
    const req = f && artifact.debug.requires.find((r) => r.ip === f.ip - 1);
    if (req) throw new FailedRequireError(artifact, f.ip - 1, req, POOL_INPUT, '', error.message);
    throw error;
  }
}
const guard = (line, statement) => new RegExp(`ShieldPool\\.scash:${line} Require statement failed at input 3 `
  + '[\\s\\S]*Failing statement: ' + statement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const lockOf = (s) => h.p2pkhLock(s.publicKey);
const utxosAt = (lock) => provider.getUtxosForLockingBytecode(hex(lock));

beforeAll(async () => {
  provider = network.provider;
  [alice, bob] = await ethers.getSigners(2);
  key.alice = Buffer.from(alice.privateKey);
  key.bob = Buffer.from(bob.privateKey);
  artifact = (await ethers.getContractFactory('ShieldPool')).artifact;

  const V = await loadVerifier(h.HERE + 'build/mainnet.fixtures.json');
  const build = readJson(h.HERE + 'build/mainnet-live.build.json');
  expect(build.vkSha).toBe(V.vkSha);
  const prog = { R: bin(build.redeemHex), pieces: build.codePiecesHex.map(bin), lay: build.layout, locking: bin(build.lockingHex) };
  const poolToken = poolTokenOf(mainnet.category);
  const contract = new Contract(artifact, [Uint8Array.from(prog.locking), Uint8Array.from(poolToken)], { provider });
  pool = {
    contract, lock: bin(contract.lockingBytecode), redeem: Buffer.from(contract.bytecodeBin),
    unlocking: ({ C0, C1, N0, N1, extData }) => Buffer.from(contract.unlock.transact(...[C0, C1, N0, N1, extData].map((x) => Uint8Array.from(x)))
      .generateUnlockingBytecode({ transaction: { inputs: [], outputs: [] }, sourceOutputs: [], inputIndex: POOL_INPUT })),
  };
  D = { V, prog, pool, poolToken, category: bin(mainnet.category), verifierLock: prog.locking };
});

// Fixtures: each step is planned and proved on the previous step's chain ("ready"), then broadcast ("sent").
// loadFixture snapshots the mock chain after each, so a test can start from any point of the lifecycle.
async function genesisDeployed() {
  // the category is the txid of the outpoint the genesis spends, at output index 0
  await provider.addUtxo(hex(lockOf(alice)), { txid: mainnet.category, vout: 0, satoshis: 3_000_000n });
  const funding = { txid: D.category, vout: 0, value: 3_000_000n, lock: lockOf(alice) };
  const G = h.genesisTx({ funding, sGenesis: bin(chain.genesis.S), verifierLock: D.verifierLock,
    poolValue: BigInt(mainnet.pool.initialValue), changeLock: lockOf(alice), fee: 1000n });
  h.signP2pkh(G.transaction, G.sourceOutputs, 0, key.alice);
  const txid = await send(G);
  const coin = (i) => ({ txid: bin(txid), vout: i, value: G.transaction.outputs[i].valueSatoshis,
    lock: Buffer.from(G.transaction.outputs[i].lockingBytecode), token: G.transaction.outputs[i].token });
  return { G, txid, next: { pool: coin(0), verifiers: [coin(1), coin(2), coin(3)], alice: coin(4) } };
}

async function prepare(k, pre) {
  const s = chain.steps[k];
  const P = s.pieces;
  const ext = h.decodeExtData(bin(P.extData));
  const publicAmount = i64(bin(P.publicAmount));
  const t = { S1: bin(P.S1), publicAmount, args: { C0: bin(P.C0), C1: bin(P.C1), N0: bin(P.N0), N1: bin(P.N1) },
    extData: bin(P.extData), ext: { recipientLock: ext.recipientLock, payout: ext.payout, fee: ext.fee } };
  if (publicAmount > 0n) {
    t.funding = [{ coin: pre.alice, priv: key.alice }];
    t.change = { lock: lockOf(alice), value: pre.alice.value - publicAmount - MINER_FEE };
  } else {
    // the fixture's pool-paid fee (2,000 / 3,000 sat) is under the 1 sat/B relay floor, so Bob sponsors the miner
    // fee with one extra input; the pool allows extra inputs but no extra output
    const sponsor = { txid: hex(h.sha256(Buffer.from(`sponsor ${k}`))), vout: 0, satoshis: MINER_FEE };
    await provider.addUtxo(hex(lockOf(bob)), sponsor);
    t.funding = [{ coin: { txid: bin(sponsor.txid), vout: 0, value: MINER_FEE, lock: lockOf(bob) }, priv: key.bob }];
  }
  const plan = h.planTransact(D, pre, t);
  const pr = await h.prove(D, plan, { given: { proof: s.proof, publicSignals: s.publicSignals } });
  return { k, s, ext, publicAmount, pre, plan, pr, b: h.finalize(plan, pr.U) };
}
async function broadcast(r) {
  const txid = await send(r.b);
  const next = h.nextState(r.plan, r.b.transaction);
  next.alice = next.extra[0] ?? r.pre.alice;
  return { ...r, txid, next };
}
async function depositReady() { return prepare(0, (await loadFixture(genesisDeployed)).next); }
async function depositSent() { return broadcast(await loadFixture(depositReady)); }
async function transferReady() { return prepare(1, (await loadFixture(depositSent)).next); }
async function transferSent() { return broadcast(await loadFixture(transferReady)); }
async function withdrawReady() { return prepare(2, (await loadFixture(transferSent)).next); }
async function withdrawSent() { return broadcast(await loadFixture(withdrawReady)); }

describe('ShieldPool artifact', () => {
  it('runs on the strict mock profile (BCH size limits, dust and standardness)', () => {
    expect(network.name).toBe('strict');
    expect(provider.consensusLimits).toMatchObject({ maximumInputBytes: 10_000, maximumStackItemBytes: 10_000,
      maximumTransactionBytes: 100_000, maximumNftCommitmentBytes: 128, operationCostBudgetPerByte: 800 });
    expect(provider.policy.enforceDust).toBe(true);
  });

  it('compiles with SolidHat to the deployed covenant', () => {
    expect(artifact.contractName).toBe('ShieldPool');
    expect(artifact.compiler.version).toBe('0.51.1');
    expect(artifact.constructorInputs.map((x) => x.name)).toEqual(['verifierLock', 'poolToken']);
    expect(artifact.abi.map((f) => [f.name, f.inputs.map((x) => x.type)]))
      .toEqual([['transact', ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'bytes']]]);
    expect(artifact.bytecode).toBe(readJson(h.HERE + 'build/ShieldPool.json').bytecode);
  });

  it('reproduces the mainnet pool and verifier locks from the deployed parameters', () => {
    expect(hex(D.poolToken)).toBe(mainnet.pool.poolTokenHex);
    expect(hex(D.verifierLock)).toBe(mainnet.verifier.lockHex);
    expect(hex(pool.redeem)).toBe(mainnet.pool.redeemHex);
    expect(hex(pool.lock)).toBe(mainnet.pool.lockHex);
    expect(pool.contract.address).toMatch(/^bchtest:p/);
  });
});

describe('ShieldPool lifecycle on the SolidHat mock', () => {
  it('genesis: pool NFT with S_genesis and three verifier coins', async () => {
    const { G, txid } = await loadFixture(genesisDeployed);
    expect(mainnet.pool.sGenesis).toBe(chain.genesis.S);
    expect(hex(G.pool.lock)).toBe(hex(pool.lock));
    expect(txid).toBe(hex(h.txidOf(G.transaction)));

    const [poolUtxo, ...others] = await utxosAt(pool.lock);
    expect(others).toHaveLength(0);
    expect(poolUtxo).toMatchObject({ txid, vout: 0, satoshis: 1000n });
    expect(poolUtxo.token).toMatchObject({ category: mainnet.category, amount: 0n, nft: { capability: 'mutable', commitment: chain.genesis.S } });
    const verifiers = await utxosAt(D.verifierLock);
    expect(verifiers.map((u) => [u.txid, u.vout, u.satoshis])).toEqual([1, 2, 3].map((vout) => [txid, vout, 1000n]));
  });

  for (const [name, fixture] of [['deposit', depositSent], ['transfer', transferSent], ['withdraw', withdrawSent]]) {
    it(`${name}: accepted, pool value and NFT commitment advance`, async () => {
      const { s, ext, publicAmount, pre, b, txid } = await loadFixture(fixture);
      expect(s.name).toBe(name);
      expect(hex(pre.pool.token.nft.commitment)).toBe(s.pre.S0);
      expect(pre.pool.value).toBe(BigInt(s.pre.poolValue));
      expect(txid).toBe(hex(h.txidOf(b.transaction)));

      const [poolUtxo, ...others] = await utxosAt(pool.lock);
      expect(others).toHaveLength(0);
      expect(poolUtxo).toMatchObject({ txid, vout: 0, satoshis: BigInt(s.newPoolValue) });
      expect(poolUtxo.satoshis - pre.pool.value).toBe(publicAmount);
      expect(poolUtxo.token).toMatchObject({ category: mainnet.category, amount: 0n, nft: { capability: 'mutable', commitment: s.pieces.S1 } });
      expect(await provider.getLedgerOutput(hex(pre.pool.txid), pre.pool.vout)).toBeUndefined();

      const v = ext.payout > 0n ? 2 : 1;
      const verifiers = await utxosAt(D.verifierLock);
      expect(verifiers.map((u) => [u.txid, u.vout, u.satoshis])).toEqual([v, v + 1, v + 2].map((vout) => [txid, vout, 1000n]));
      if (s.payoutOutput) {
        const paid = (await utxosAt(bin(s.payoutOutput.lockingBytecode))).filter((u) => u.txid === txid);
        expect(paid.map((u) => [u.vout, u.satoshis])).toEqual([[1, BigInt(s.payoutOutput.value)]]);
      }
      expect(b.transaction.outputs).toHaveLength(publicAmount < 0n ? v + 3 : v + 4);
    });
  }
});

describe('ShieldPool rejects on the SolidHat mock', () => {
  // a step's own transaction and proof, mutated, on the step's pre-state chain
  const attempt = async (ready, mutate) => {
    const r = await loadFixture(ready);
    const p = h.clonePlan(r.plan);
    mutate(p, r);
    return send(h.finalize(p, r.pr.U));
  };
  const flip = (b, i) => { const c = Buffer.from(b); c[i] ^= 1; return c; };

  it('wrong old state: the deposit proof replayed on the post-deposit pool', async () => {
    const dep = await loadFixture(depositReady);
    const { pre } = await loadFixture(transferReady);
    const p = h.clonePlan(dep.plan);
    p.inputs.slice(0, 3).forEach((x, i) => { x.coin = { ...pre.verifiers[i] }; });
    p.inputs[POOL_INPUT].coin = { ...pre.pool };
    p.inputs[4].coin = { ...pre.alice };
    p.outputs[0].value = pre.pool.value + p.publicAmount;
    p.outputs.at(-1).value = pre.alice.value - p.publicAmount - MINER_FEE;
    await expect(send(h.finalize(p, dep.pr.U)))
      .toBeRevertedWith(guard(32, 'require(ns.split(32)[0].reverse() == tx.inputs[3].nftCommitment)'));
  });

  it('payout to a lock other than the recipient bound in extData', async () => {
    await expect(attempt(withdrawReady, (p) => { p.outputs[1].lock = h.locks.thief; }))
      .toBeRevertedWith(guard(59, 'require(tx.outputs[1].lockingBytecode == recipientLock)'));
  });

  it('payout 1 sat short of extData', async () => {
    await expect(attempt(withdrawReady, (p) => { p.outputs[1].value -= 1n; }))
      .toBeRevertedWith(guard(60, 'require(tx.outputs[1].value == payout)'));
  });

  it(`fee above MAX_FEE (${MAX_FEE + 1n} sat), with the pool value balanced to it`, async () => {
    await expect(attempt(withdrawReady, (p, r) => {
      const fee = MAX_FEE + 1n;
      h.setPoolArgs(D, p, { extData: h.encodeExtData({ ...r.ext, fee }) });
      p.outputs[0].value = r.pre.pool.value - r.ext.payout - fee;
    })).toBeRevertedWith(guard(55, 'require(fee <= 50000)'));
  });

  it('pool value skimmed on a withdraw (payout + fee != -publicAmount)', async () => {
    await expect(attempt(withdrawReady, (p) => { p.outputs[0].value -= 1000n; }))
      .toBeRevertedWith(guard(54, 'require(0 - publicAmount == payout + fee)'));
  });

  it('change output on a pool-paid transfer (negative publicAmount)', async () => {
    await expect(attempt(transferReady, (p) => { p.outputs.push({ lock: h.locks.thief, value: 1000n }); }))
      .toBeRevertedWith(guard(71, 'require(tx.outputs.length == v + 3)'));
  });

  it('change output on a withdraw, beside the payout', async () => {
    await expect(attempt(withdrawReady, (p) => { p.outputs.push({ lock: h.locks.thief, value: 1000n }); }))
      .toBeRevertedWith(guard(71, 'require(tx.outputs.length == v + 3)'));
  });

  it('output 0 moves the pool NFT to another lock', async () => {
    await expect(attempt(transferReady, (p) => { p.outputs[0].lock = h.locks.thief; }))
      .toBeRevertedWith(guard(34, 'require(tx.outputs[0].lockingBytecode == tx.inputs[3].lockingBytecode)'));
  });

  it('output 0 downgrades the pool NFT to immutable', async () => {
    await expect(attempt(transferReady, (p) => { p.outputs[0].token = { ...p.outputs[0].token, nft: { ...p.outputs[0].token.nft, capability: 'none' } }; }))
      .toBeRevertedWith(guard(35, 'require(tx.outputs[0].tokenCategory == poolToken)'));
  });

  it('a verifier coin is not recreated (sent to another lock)', async () => {
    await expect(attempt(transferReady, (p) => { p.outputs[1].lock = h.locks.thief; }))
      .toBeRevertedWith(guard(63, 'require(tx.outputs[v].lockingBytecode == verifierLock)'));
  });

  it('extData ciphertext tampered: the binding hash no longer matches the proof', async () => {
    await expect(attempt(transferReady, (p) => { h.setPoolArgs(D, p, { extData: flip(p.args.extData, p.args.extData.length - 1) }); }))
      .toBeRevertedWith(guard(83, 'require(ns.split(32)[1].reverse() == hm)'));
  });

  it('the verifier coins refuse a statement the proof does not prove (n1 changed in input 2)', async () => {
    const r = await loadFixture(withdrawReady);
    const U = r.pr.U.map((u) => Buffer.from(u));
    U[2][N1_OFFSET] ^= 1;
    await expect(send(h.finalize(r.plan, U))).rejects.toThrow(/mandatory-script-verify-flag-failed[\s\S]*input index [0-2]:/);
  });

  it('control: the unmodified withdraw is accepted on the same pre-state', async () => {
    const r = await loadFixture(withdrawReady);
    await expect(attempt(withdrawReady, () => {})).resolves.toBe(hex(h.txidOf(r.b.transaction)));
  });
});
