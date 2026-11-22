import { defineConfig } from '@solidcash/solidhat/config';

// Mock networks only: these tests never touch a live chain.
export default defineConfig({
  paths: {
    contracts: '.',
    artifacts: 'artifacts',
    tests: 'test/solidhat',
  },
  // plain solidc options, so the artifact matches build/ShieldPool.json (the one deployed on mainnet)
  compiler: {},
  accounts: { count: 2, satoshis: 100_000_000n },
  networks: {
    mock: { type: 'mock' },
    // BCH production limits on the in-process mock (docs: "Give the mock production limits")
    strict: {
      type: 'mock',
      consensus: {
        maximumInputBytes: 10_000,
        maximumStackItemBytes: 10_000,
        maximumTransactionBytes: 100_000,
        maximumNftCommitmentBytes: 128,
      },
      policy: { enforceDust: true },
    },
  },
  defaultNetwork: 'strict',
});
