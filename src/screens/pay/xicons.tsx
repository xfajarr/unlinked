// Logos for NEAR Intents chains and tokens. A lazy chunk (about 130 kB gzipped) that loads only with the cross-chain picker.
import type { ComponentType } from 'react'
import {
  NetworkAbstract, NetworkAdiChain, NetworkAleo, NetworkAptos, NetworkArbitrumOne, NetworkAvalanche, NetworkBase, NetworkBerachain, NetworkBinanceSmartChain, NetworkBitcoin, NetworkBitcoinCash, NetworkCardano, NetworkDogecoin, NetworkEthereum, NetworkFogo, NetworkGnosis, NetworkHyperEvm, NetworkLitecoin, NetworkMonad, NetworkMovement, NetworkNearProtocol, NetworkOptimism, NetworkPlasma, NetworkPolygon, NetworkRobinhood, NetworkScroll, NetworkSolana, NetworkStarknet, NetworkStellar, NetworkSui, NetworkTon, NetworkTron, NetworkXLayer, NetworkXrp, NetworkZcash, TokenAAVE, TokenADA, TokenADI, TokenALEO, TokenAPT, TokenARB, TokenAURORA, TokenAVAX, TokenBNB, TokenBTC, TokenCBBTC, TokenCOW, TokenDAI, TokenDASH, TokenDOGE, TokenETH, TokenEURE, TokenFOGO, TokenFRAX, TokenGMX, TokenGNO, TokenGRAM, TokenHAPI, TokenKNC, TokenLINK, TokenLTC, TokenMOG, TokenMON, TokenMOVE, TokenNEAR, TokenNPRO, TokenOKB, TokenOP, TokenPEPE, TokenPOL, TokenSAFE, TokenSHIB, TokenSOL, TokenSPX, TokenSTRK, TokenSUI, TokenSWEAT, TokenTRX, TokenUNI, TokenUSDC, TokenUSDE, TokenUSDT, TokenWBTC, TokenXAUT, TokenXLM, TokenXPL, TokenXRP, TokenZEC,
} from '@web3icons/react'
import { chainName } from './tokens'

type Logo = ComponentType<{ size?: number; variant?: 'mono' | 'branded' | 'background'; style?: React.CSSProperties; 'aria-hidden'?: boolean }>

const NET: Record<string, Logo> = { abs: NetworkAbstract, adi: NetworkAdiChain, aleo: NetworkAleo, aptos: NetworkAptos, arb: NetworkArbitrumOne, avax: NetworkAvalanche, base: NetworkBase, bch: NetworkBitcoinCash, bera: NetworkBerachain, bsc: NetworkBinanceSmartChain, btc: NetworkBitcoin, cardano: NetworkCardano, doge: NetworkDogecoin, eth: NetworkEthereum, fogo: NetworkFogo, gnosis: NetworkGnosis, hood: NetworkRobinhood, hypercore: NetworkHyperEvm, ltc: NetworkLitecoin, monad: NetworkMonad, movement: NetworkMovement, near: NetworkNearProtocol, op: NetworkOptimism, plasma: NetworkPlasma, pol: NetworkPolygon, scroll: NetworkScroll, sol: NetworkSolana, starknet: NetworkStarknet, stellar: NetworkStellar, sui: NetworkSui, ton: NetworkTon, tron: NetworkTron, xlayer: NetworkXLayer, xrp: NetworkXrp, zec: NetworkZcash }
const TOK: Record<string, Logo> = { "WNEAR": TokenNEAR, "ETH": TokenETH, "USDC": TokenUSDC, "FRAX": TokenFRAX, "AURORA": TokenAURORA, "WBTC": TokenWBTC, "ZEC": TokenZEC, "HAPI": TokenHAPI, "NPRO": TokenNPRO, "USDT": TokenUSDT, "XAUT": TokenXAUT, "SUI": TokenSUI, "BTC": TokenBTC, "CBBTC": TokenCBBTC, "SOL": TokenSOL, "FOGO": TokenFOGO, "ARB": TokenARB, "DOGE": TokenDOGE, "XRP": TokenXRP, "KNC": TokenKNC, "DAI": TokenDAI, "GNO": TokenGNO, "COW": TokenCOW, "SAFE": TokenSAFE, "AAVE": TokenAAVE, "UNI": TokenUNI, "LINK": TokenLINK, "STRK": TokenSTRK, "BNB": TokenBNB, "MON": TokenMON, "OKB": TokenOKB, "XPL": TokenXPL, "POL": TokenPOL, "TRX": TokenTRX, "GRAM": TokenGRAM, "OP": TokenOP, "AVAX": TokenAVAX, "XLM": TokenXLM, "ADA": TokenADA, "APT": TokenAPT, "LTC": TokenLTC, "SPX": TokenSPX, "ADI": TokenADI, "SHIB": TokenSHIB, "PEPE": TokenPEPE, "ALEO": TokenALEO, "DASH": TokenDASH, "XBTC": TokenBTC, "WETH": TokenETH, "USDT0": TokenUSDT, "XDAI": TokenDAI, "SWEAT": TokenSWEAT, "NEAR": TokenNEAR, "SUSDC": TokenUSDC, "USDCX": TokenUSDC, "STNEAR": TokenNEAR, "STRKBTC": TokenBTC, "GMX": TokenGMX, "STEAKUSDC": TokenUSDC, "MOG": TokenMOG, "GTUSDCP": TokenUSDC, "SPARKUSDC": TokenUSDC, "MWUSDC": TokenUSDC, "LAUSDC": TokenUSDC, "EURE": TokenEURE, "NRUSDT": TokenUSDT, "HEMIBTC": TokenBTC, "MOVE": TokenMOVE, "USDE": TokenUSDE, "WSTETH": TokenETH, "CNEAR": TokenNEAR, "BTCOMNI": TokenBTC }

const Letter = ({ text, size }: { text: string; size: number }) => (
  <span className="pay-chain-letter" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden>{(text.replace(/[^A-Za-z0-9]/g, '')[0] ?? '?').toUpperCase()}</span>
)

export function ChainLogo({ id, size = 20 }: { id: string; size?: number }) {
  const L = NET[id]
  return L ? <L variant="background" size={size} style={{ display: 'block', borderRadius: '50%', flexShrink: 0 }} aria-hidden /> : <Letter text={chainName(id)} size={size} />
}

export function TokenLogo({ symbol, size = 18 }: { symbol: string; size?: number }) {
  const L = TOK[symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')]
  return L ? <L variant="background" size={size} style={{ display: 'block', borderRadius: '50%', flexShrink: 0 }} aria-hidden /> : <Letter text={symbol} size={size} />
}
