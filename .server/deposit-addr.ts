export function deposit_addr(chain: string): string {
  switch (chain.toUpperCase()) {
    case "ETH":
    case "BNB":
      return process.env.CRYPTO_DEPOSIT_ADDR_EVM;
    case "HBAR":
      return process.env.CRYPTO_DEPOSIT_ADDR_HBAR;
    case "REEF":
      return process.env.CRYPTO_DEPOSIT_ADDR_REEF;
    default:
      return "chain not supported";
  }
}
