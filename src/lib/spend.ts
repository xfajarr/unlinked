// Spending from one-time addresses (spec 4.5, 4.7, 5.5). Signs locally with p = b + t; nothing leaves the device
// except the signed transaction. libauth, stealth and fulcrum load lazily (they can't run in server rendering).
import type { Profile } from './api'
import type { Utxo } from './fulcrum'
import { preparePayment, type Received } from './payments'
import { currentKeys } from './vault'

const lib = () => import('@bitauth/libauth')
const stealthLib = () => import('./stealth')
const fulcrumLib = () => import('./fulcrum')

export type WithdrawOptions = { private: boolean }

const FEE_RATE = 1.1 // sats per byte; relay minimum is 1.0
const DUST = 546n
const TOKEN_DUST = 1000n

type Out = { lockingBytecode: Uint8Array; valueSatoshis: bigint; token?: { amount: bigint; category: Uint8Array } }
type SignedInput = { utxo: Utxo; priv: Uint8Array }

function keysOrThrow() {
  const k = currentKeys()
  if (!k) throw new Error('Unlock your inbox first')
  return k
}

async function lockingBytecodeFor(address: string, needsTokens: boolean): Promise<Uint8Array> {
  const L = await lib()
  const r = L.cashAddressToLockingBytecode(address.trim())
  if (typeof r === 'string') throw new Error('That is not a valid Bitcoin Cash address')
  if (needsTokens && !r.tokenSupport) throw new Error('This payment includes dollars (PUSD). Use a token-aware address that starts with bitcoincash:z')
  return r.bytecode
}

/** Builds with a placeholder fee, measures the size, rebuilds with the real fee. Returns raw tx hex. */
async function buildAndSign(inputs: SignedInput[], outputsFor: (fee: bigint) => Out[]): Promise<string> {
  const L = await lib()
  const compiler = L.walletTemplateToCompilerBCH(L.walletTemplateP2pkhNonHd)
  const gen = (fee: bigint) => {
    const r = L.generateTransaction({
      version: 2,
      locktime: 0,
      inputs: inputs.map(({ utxo, priv }) => ({
        outpointIndex: utxo.tx_pos,
        outpointTransactionHash: L.hexToBin(utxo.tx_hash),
        sequenceNumber: 0,
        unlockingBytecode: {
          compiler,
          data: { keys: { privateKeys: { key: priv } } },
          script: 'unlock',
          valueSatoshis: BigInt(utxo.value),
          ...(utxo.token_data ? { token: { amount: BigInt(utxo.token_data.amount), category: L.hexToBin(utxo.token_data.category) } } : {}),
        },
      })),
      outputs: outputsFor(fee),
    })
    if (!r.success) throw new Error('Could not build the transaction')
    return L.encodeTransaction(r.transaction)
  }
  const draft = gen(1000n)
  return L.binToHex(gen(BigInt(Math.ceil(draft.length * FEE_RATE))))
}

function sweepOutputs(utxos: Utxo[], dest: Uint8Array, hexToBin: (h: string) => Uint8Array) {
  const total = utxos.reduce((s, u) => s + BigInt(u.value), 0n)
  const tokens = new Map<string, bigint>()
  for (const u of utxos) {
    if (!u.token_data) continue
    if (u.token_data.nft) throw new Error('This payment holds an NFT, which withdraw does not support yet')
    tokens.set(u.token_data.category, (tokens.get(u.token_data.category) ?? 0n) + BigInt(u.token_data.amount))
  }
  return (fee: bigint): Out[] => {
    const outs: Out[] = [...tokens].map(([category, amount]) => ({ lockingBytecode: dest, valueSatoshis: TOKEN_DUST, token: { amount, category: hexToBin(category) } }))
    const rest = total - TOKEN_DUST * BigInt(outs.length) - fee
    if (rest >= DUST) outs.push({ lockingBytecode: dest, valueSatoshis: rest })
    else if (outs.length && rest >= 0n) outs[0]!.valueSatoshis += rest
    else throw new Error('This payment is too small to withdraw after the network fee')
    return outs
  }
}

async function signerFor(item: Received): Promise<Uint8Array> {
  const { spendKey } = await stealthLib()
  return spendKey(keysOrThrow().spendPriv, item.match)
}

/** Signed withdraw transactions (no network). Private mode: one transaction per payment, never merged. */
export async function buildWithdrawTxs(items: Received[], destination: string, opts: WithdrawOptions, spendPriv = keysOrThrow().spendPriv): Promise<string[]> {
  if (!items.length) throw new Error('Choose at least one payment')
  const L = await lib()
  const { spendKey } = await stealthLib()
  const groups = opts.private ? items.map((i) => [i]) : [items]
  const txs: string[] = []
  for (const group of groups) {
    const utxos = group.flatMap((i) => i.utxos)
    const dest = await lockingBytecodeFor(destination, utxos.some((u) => u.token_data))
    const inputs: SignedInput[] = group.flatMap((item) => {
      const priv = spendKey(spendPriv, item.match)
      return item.utxos.map((utxo) => ({ utxo, priv }))
    })
    txs.push(await buildAndSign(inputs, sweepOutputs(utxos, dest, L.hexToBin)))
  }
  return txs
}

export async function withdraw(items: Received[], destination: string, opts: WithdrawOptions): Promise<string[]> {
  const txs = await buildWithdrawTxs(items, destination, opts)
  const { broadcast } = await fulcrumLib()
  const txids: string[] = []
  for (const hex of txs) txids.push(await broadcast(hex))
  return txids
}

/** Private send to another handle: one one-time input pays a fresh one-time address of the recipient (announced first, plus an OP_RETURN copy); change goes to a fresh one-time address of ours. */
export async function sendToHandle(items: Received[], to: Profile, sats: number): Promise<string[]> {
  const keys = keysOrThrow()
  const amount = BigInt(Math.round(sats))
  if (amount < DUST) throw new Error('Send at least 546 satoshis')
  // ponytail: one input only, no merging; upgrade: split a large send across several single-input txs
  const from = items
    .filter((i) => !i.utxos.some((u) => u.token_data))
    .sort((a, b) => a.sats - b.sats)
    .find((i) => BigInt(i.sats) >= amount + 2000n)
  if (!from) throw new Error('No single payment covers this amount. Send a smaller amount, or withdraw first.')

  const L = await lib()
  const { announcementPushes } = await stealthLib()
  const { broadcast } = await fulcrumLib()
  const { toHex } = await import('./hex')
  const recipient = await preparePayment(to)
  const change = await preparePayment({ scanPub: toHex(keys.scanPub), spendPub: toHex(keys.spendPub) })
  const toLock = await lockingBytecodeFor(recipient.address, false)
  const changeLock = await lockingBytecodeFor(change.address, false)
  const opReturn = Uint8Array.from([0x6a, ...announcementPushes(recipient.ephemeralPub, recipient.viewTag).flatMap((p) => [...L.encodeDataPush(p)])])
  const priv = await signerFor(from)
  const total = BigInt(from.sats)
  const hex = await buildAndSign(
    from.utxos.map((utxo) => ({ utxo, priv })),
    (fee) => {
      const rest = total - amount - fee
      const outs: Out[] = [{ lockingBytecode: toLock, valueSatoshis: amount }, { lockingBytecode: opReturn, valueSatoshis: 0n }]
      if (rest >= DUST) outs.push({ lockingBytecode: changeLock, valueSatoshis: rest })
      else if (rest < 0n) throw new Error('Not enough to cover the network fee')
      return outs
    },
  )
  return [await broadcast(hex)]
}
