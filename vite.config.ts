import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // the chipnet build (VITE_NETWORK=chipnet) gets its own dep cache, so both dev servers can run side by side
  cacheDir: process.env.VITE_NETWORK === 'chipnet' ? 'node_modules/.vite-chipnet' : 'node_modules/.vite',
  build: { target: 'es2022' },
  resolve: {
    // shield/lib needs only Poseidon; circomlibjs' main entry also pulls in ethers, blake and the EVM generators
    alias: [{ find: /^circomlibjs$/, replacement: fileURLToPath(new URL('./node_modules/circomlibjs/src/poseidon_wasm.js', import.meta.url)) }],
  },
  // the prover worker imports snarkjs dynamically, which needs ES module workers
  worker: { format: 'es' },
  // pre-bundle the lazy-loaded libraries so the first use doesn't trigger a full reload (which drops unlocked keys)
  optimizeDeps: {
    include: ['qrcode-generator', '@electrum-cash/network', '@bitauth/libauth', '@wizardconnect/dapp', '@wizardconnect/core', 'circomlibjs', 'snarkjs'],
    esbuildOptions: { target: 'es2022' },
  },
  // allow the Cloudflare quick tunnel host so the dev server can be shared
  server: { allowedHosts: ['.trycloudflare.com'] },
  preview: { allowedHosts: ['.trycloudflare.com'] },
})
