// The payer's EVM wallet for stablecoin deposits: an injected wallet (EIP-1193: MetaMask, Rabby, a wallet's in-app browser) or WalletConnect.
type Provider = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>
  disconnect?: () => Promise<void>
}

export const EVM_CHAIN_ID: Record<string, number> = { eth: 1, base: 8453, arb: 42161, bsc: 56, op: 10, pol: 137, avax: 43114, gnosis: 100, scroll: 534352 }
/** WalletConnect needs a project id from cloud.reown.com, set as VITE_WC_PROJECT_ID; without it only injected wallets show. */
export const WC_PROJECT_ID: string = import.meta.env.VITE_WC_PROJECT_ID ?? ''

const injected = (): Provider | null => (globalThis as { ethereum?: Provider }).ethereum ?? null
export const hasInjected = () => !!injected()

export type EvmWallet = { provider: Provider; account: string; kind: 'injected' | 'walletconnect' }

export async function connectInjected(): Promise<EvmWallet> {
  const provider = injected()
  if (!provider) throw new Error('No browser wallet found. Open this page in your wallet app, or use WalletConnect.')
  return { provider, account: await account(provider), kind: 'injected' }
}

export async function connectWalletConnect(chainId: number, onUri: (uri: string) => void): Promise<EvmWallet> {
  if (!WC_PROJECT_ID) throw new Error('WalletConnect is not set up on this site.')
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider')
  const provider = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    optionalChains: [chainId],
    showQrModal: false,
    metadata: { name: 'Unlinked', description: 'Stablecoin bridge to Bitcoin Cash', url: location.origin, icons: [`${location.origin}/mark.svg`] },
  })
  provider.on('display_uri', onUri)
  await provider.connect()
  return { provider: provider as unknown as Provider, account: await account(provider as unknown as Provider), kind: 'walletconnect' }
}

async function account(p: Provider): Promise<string> {
  const a = (await p.request({ method: 'eth_requestAccounts' })) as string[]
  if (!a?.[0]) throw new Error('Your wallet did not share an account.')
  return a[0]
}

async function useChain(p: Provider, chainId: number, chainLabel: string) {
  const cur = Number.parseInt(String(await p.request({ method: 'eth_chainId' })), 16)
  if (cur === chainId) return
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chainId.toString(16)}` }] })
  } catch {
    throw new Error(`Switch your wallet to ${chainLabel} and try again.`)
  }
}

/** Native coin transfer (ETH, BNB, POL, AVAX) from the connected account. Returns the tx hash. */
export async function sendNative(w: EvmWallet, chainId: number, chainLabel: string, to: string, units: bigint): Promise<string> {
  await useChain(w.provider, chainId, chainLabel)
  return (await w.provider.request({ method: 'eth_sendTransaction', params: [{ from: w.account, to, value: `0x${units.toString(16)}` }] })) as string
}

/** ERC-20 transfer(to, units) from the connected account. Returns the tx hash. */
export async function sendErc20(w: EvmWallet, chainId: number, chainLabel: string, token: string, to: string, units: bigint): Promise<string> {
  await useChain(w.provider, chainId, chainLabel)
  const word = (hex: string) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0')
  const data = `0xa9059cbb${word(to)}${word(units.toString(16))}`
  return (await w.provider.request({ method: 'eth_sendTransaction', params: [{ from: w.account, to: token, data }] })) as string
}
