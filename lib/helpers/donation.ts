import type { TFrequency } from "../schemas";

export function min_fee_allowance(
  amount: number,
  rate: number,
  flat = 0
): number {
  /**
   * fee(1) = amount * rate + flat
   * fee(2) = (amount + fee(1)) * rate + flat
   * fee(3) = (amount + fee(2)) * rate + flat
   * i.e. F₍ₙ₎ = a · ∑ᵏ⁼¹ⁿ (rᵏ) + f · ∑ᵏ⁼⁰ⁿ⁻¹ (rᵏ)
   * which converges to this formula: n approaches infinity
   */
  return (amount * rate + flat) / (1 - rate);
}
const freqs_all: TFrequency[] = ["one-time", "weekly", "monthly", "annual"];

export const to_freqs = (freq_bools: boolean[]): TFrequency[] => {
  return freqs_all.filter((_, i) => freq_bools[i]);
};

export const to_freq_bools = (
  freqs_in: TFrequency[] | undefined
): boolean[] => {
  return freqs_in
    ? freqs_all.map((f) => freqs_in.includes(f))
    : [true, false, true, false];
};
