export const fees = {
  /** Base fee at 1.5% for nonprofits that opt-out of BG tipping */
  base: 0.015,
  /** Fiscal sponsorship fee at 2.9% */
  fiscal_sponsor: 0.029,
  stripe: 0.022,
  /** cents */
  stripe_flat: 0.3,
  chariot: 0.029,
  /**
   * 1% (0.5% exchange fee, 0.5% service fee)
   * NOTE: exchange fee is not applied if currency is the same as settlement currency
   */
  crypto: 0.01,
} as const;

export const apex_domain = "better.giving";
