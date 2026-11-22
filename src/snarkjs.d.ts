declare module 'snarkjs' {
  export const wtns: { calculate(input: unknown, wasm: string, out: unknown): Promise<void> }
  export const groth16: {
    prove(zkey: string, wtns: unknown): Promise<{ proof: unknown; publicSignals: string[] }>
    fullProve(input: unknown, wasm: string, zkey: string): Promise<{ proof: unknown; publicSignals: string[] }>
    verify(vk: unknown, publicSignals: string[], proof: unknown): Promise<boolean>
  }
}
