const DEPOSIT_CHAINS = ["eth", "bnb", "hbar", "reef"] as const;

export type DepositChain = (typeof DEPOSIT_CHAINS)[number];

export const is_deposit_chain = (x: string): x is DepositChain =>
  (DEPOSIT_CHAINS as readonly string[]).includes(x);

export function deposit_addr(chain: DepositChain): string {
  switch (chain) {
    case "eth":
    case "bnb":
      return process.env.CRYPTO_DEPOSIT_ADDR_EVM;
    case "hbar":
      return process.env.CRYPTO_DEPOSIT_ADDR_HBAR;
    case "reef":
      return process.env.CRYPTO_DEPOSIT_ADDR_REEF;
  }
}
