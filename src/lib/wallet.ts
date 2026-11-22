// Payer wallet via WizardConnect (spec 4.3): the dapp builds the payment and OP_RETURN announcement, the wallet signs and broadcasts. Browser only, loaded lazily.
import { createElement } from 'react'
import type { WalletStage } from '../components/WalletOverlay'
import { CASHADDR_PREFIX, PUSD_CATEGORY, PUSD_DECIMALS } from './config'
import type { Utxo } from './fulcrum'
import { reloadOnStaleChunk } from './stale'

export type WalletPay = { to: string; tokenTo: string; ephemeralPub: string; viewTag: number; currency: 'BCH' | 'PUSD'; amount: number; note?: string }

const FEE_RATE = 1.1
const DUST = 546n
const TOKEN_DUST = 1000n
const SCAN_GAP = 25
const PATHS = [
  { child: 0, name: 'receive' },
  { child: 1, name: 'change' },
] as const

type Owned = { utxo: Utxo; child: number; name: string; index: number; lock: Uint8Array }

export async function payWithWallet(p: WalletPay): Promise<string> {
  const [{ DappConnectionManager }, { initiateDappRelay }, L, F, S, { createRoot }, { WalletOverlay }] = await Promise.all([
    import('@wizardconnect/dapp'),
    import('@wizardconnect/core'),
    import('@bitauth/libauth'),
    import('./fulcrum'),
    import('./stealth'),
    import('react-dom/client'),
    import('../components/WalletOverlay'),
  ]).catch((e: unknown) => {
    if (reloadOnStaleChunk(e)) return new Promise<never>(() => {})
    throw e
  })

  const mgr = new DappConnectionManager('Unlinked', undefined, { session: false })
  const relay = initiateDappRelay(({ client, status }) => mgr.updateConnection(client, status))
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  let cancelled = false
  let rejectCancel: (e: Error) => void = () => {}
  const cancelP = new Promise<never>((_, rej) => (rejectCancel = rej))
  const onCancel = () => {
    cancelled = true
    rejectCancel(new Error('Payment cancelled'))
  }
  const render = (stage: WalletStage) => root.render(createElement(WalletOverlay, { uri: relay.uri, qrUri: relay.qrUri, stage, walletName: mgr.walletName, onCancel }))
  render('pair')

  try {
    await Promise.race([new Promise<void>((res) => mgr.once('walletready', () => res())), cancelP])
    render('building')

    const owned: Owned[] = []
    for (const path of PATHS) {
      const found = await Promise.all(
        Array.from({ length: SCAN_GAP }, async (_, index) => {
          const pub = mgr.getPubkey(path.child, BigInt(index))
          if (!pub) return []
          const pkh = L.hash160(pub)
          const address = L.encodeCashAddress({ prefix: CASHADDR_PREFIX, type: 'p2pkh', payload: pkh }).address
          const utxos = await F.listUnspent(address).catch(() => [] as Utxo[])
          return utxos.map((utxo) => ({ utxo, child: path.child, name: path.name, index, lock: L.encodeLockingBytecodeP2pkh(pkh) }))
        }),
      )
      owned.push(...found.flat())
    }
    if (cancelled) throw new Error('Payment cancelled')

    const toLock = L.cashAddressToLockingBytecode(p.currency === 'PUSD' ? p.tokenTo : p.to)
    if (typeof toLock === 'string') throw new Error('Invalid payment address')
    const changePub = mgr.getPubkey(1, 0n) ?? mgr.getPubkey(0, 0n)
    if (!changePub) throw new Error('Your wallet did not share an address')
    const changeLock = L.encodeLockingBytecodeP2pkh(L.hash160(changePub))
    const opReturn = Uint8Array.from([0x6a, ...S.announcementPushes(p.ephemeralPub, p.viewTag).flatMap((x) => [...L.encodeDataPush(x)])])

    const bchCoins = owned.filter((o) => !o.utxo.token_data).sort((a, b) => b.utxo.value - a.utxo.value)
    const pusdCoins = owned.filter((o) => o.utxo.token_data?.category === PUSD_CATEGORY && !o.utxo.token_data.nft)
    const pay = p.currency === 'BCH' ? BigInt(Math.round(p.amount * 1e8)) : BigInt(Math.round(p.amount * 10 ** PUSD_DECIMALS))

    const chosen: Owned[] = []
    let tokenIn = 0n
    if (p.currency === 'PUSD') {
      for (const c of pusdCoins) {
        if (tokenIn >= pay) break
        chosen.push(c)
        tokenIn += BigInt(c.utxo.token_data!.amount)
      }
      if (tokenIn < pay) throw new Error('Not enough PUSD in this wallet')
    }

    const category = L.hexToBin(PUSD_CATEGORY)
    const outputsFor = (fee: bigint) => {
      const satsIn = chosen.reduce((s, c) => s + BigInt(c.utxo.value), 0n)
      const outs: { lockingBytecode: Uint8Array; valueSatoshis: bigint; token?: { amount: bigint; category: Uint8Array } }[] = []
      if (p.currency === 'BCH') outs.push({ lockingBytecode: toLock.bytecode, valueSatoshis: pay })
      else outs.push({ lockingBytecode: toLock.bytecode, valueSatoshis: TOKEN_DUST, token: { amount: pay, category } })
      outs.push({ lockingBytecode: opReturn, valueSatoshis: 0n })
      if (tokenIn > pay) outs.push({ lockingBytecode: changeLock, valueSatoshis: TOKEN_DUST, token: { amount: tokenIn - pay, category } })
      const spent = outs.reduce((s, o) => s + o.valueSatoshis, 0n)
      const rest = satsIn - spent - fee
      if (rest >= DUST) outs.push({ lockingBytecode: changeLock, valueSatoshis: rest })
      return { outs, short: rest < 0n }
    }
    const txFor = (unlockLen: number, fee: bigint) => ({
      version: 2,
      locktime: 0,
      inputs: chosen.map((c) => ({ outpointIndex: c.utxo.tx_pos, outpointTransactionHash: L.hexToBin(c.utxo.tx_hash), sequenceNumber: 0, unlockingBytecode: new Uint8Array(unlockLen) })),
      outputs: outputsFor(fee).outs,
    })

    // Fee is re-estimated as inputs grow (107 bytes per P2PKH unlock).
    let fee = 0n
    for (;;) {
      fee = BigInt(Math.ceil(L.encodeTransaction(txFor(107, 1000n)).length * FEE_RATE))
      if (!outputsFor(fee).short) break
      const next = bchCoins.find((c) => !chosen.includes(c))
      if (!next) throw new Error(p.currency === 'BCH' ? 'Not enough BCH in this wallet' : 'Add a little BCH to this wallet for the network fee')
      chosen.push(next)
    }

    const tx = txFor(0, fee)
    const sourceOutputs = chosen.map((c, i) => ({
      ...tx.inputs[i]!,
      lockingBytecode: c.lock,
      valueSatoshis: BigInt(c.utxo.value),
      ...(c.utxo.token_data ? { token: { amount: BigInt(c.utxo.token_data.amount), category: L.hexToBin(c.utxo.token_data.category) } } : {}),
    }))
    render('approve')
    const res = await Promise.race([
      mgr.signTransaction({
        // the relay sends plain JSON, so BigInt and Uint8Array go in the extended format (<bigint: Xn>, <Uint8Array: 0x..>) wallets parse back
        transaction: { transaction: L.binToHex(L.encodeTransaction(tx)), sourceOutputs: JSON.parse(L.stringify(sourceOutputs)) as typeof sourceOutputs, broadcast: true, userPrompt: `Private payment of ${p.amount} ${p.currency}` },
        inputPaths: chosen.map((c, i) => [i, c.name, c.index] as [number, string, number]),
      }),
      cancelP,
    ])
    if (res.error) throw new Error(res.error)
    render('sending')
    const txid = L.binToHex(L.hashTransactionUiOrder(L.hexToBin(res.signedTransaction)))
    // Try broadcasting too, in case the wallet didn't ("already known" is fine).
    await F.broadcast(res.signedTransaction).catch(() => {})
    return txid
  } finally {
    mgr.sendDisconnect().catch(() => {})
    await mgr.destroy().catch(() => {})
    relay.cleanup()
    root.unmount()
    host.remove()
  }
}
