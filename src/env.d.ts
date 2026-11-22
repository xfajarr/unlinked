/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** API Worker base URL (api/). Defaults to http://localhost:8790. */
  readonly VITE_API_URL?: string
  /** 'chipnet' for the Shield demo build; mainnet otherwise. */
  readonly VITE_NETWORK?: string
}
