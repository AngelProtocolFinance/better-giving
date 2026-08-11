import { rd2num } from "../../lib/helpers/decimal";

/** [precision, atomic units e.g. 100 cents in usd] */
const spec: Record<string, [number, number]> = {
  /** https://stripe.com/docs/currencies#zero-decimal */
  BIF: [0, 0],
  CLP: [0, 0],
  DJF: [0, 0],
  GNF: [0, 0],
  JPY: [0, 0],
  KMF: [0, 0],
  KRW: [0, 0],
  MGA: [0, 0],
  PYG: [0, 0],
  RWF: [0, 0],
  VND: [0, 0],
  VUV: [0, 0],
  XAF: [0, 0],
  XOF: [0, 0],
  XPF: [0, 0],
  // https://docs.stripe.com/currencies#special-cases
  ISK: [0, 2],
  HUF: [0, 2],
  TWD: [0, 2],
  UGX: [0, 2],
  /**
   * three-decimal currencies, whose atomic unit is 1/1000.
   * https://docs.stripe.com/currencies#three-decimal
   *
   * stripe additionally requires the amount to be a multiple of 10 — the last
   * digit must be 0 — so the precision is held at 2 and scaled by 10^3, which
   * makes that true by construction instead of by a rounding rule. the donor
   * loses nothing: a millime is worth about a thousandth of a dollar.
   */
  BHD: [2, 3],
  JOD: [2, 3],
  KWD: [2, 3],
  OMR: [2, 3],
  TND: [2, 3],
};

export const to_atomic = (
  amount: number,
  [precision, atomic_units]: [number, number]
): number => {
  const rounded = rd2num(amount, precision);
  // scale by rounding, not truncating. `rd2num` has already cut the amount to
  // `precision` decimals and every spec scales by at least that many places, so
  // the exact product is a whole number of atomic units and rounding recovers
  // it. truncating instead keeps whatever the binary multiply lost: 0.29 * 100
  // is 28.999999999999996, which trunc reads as 28 cents.
  return Math.round(rounded * 10 ** atomic_units);
};

export const to_atomic_c = (currency: string) => {
  const c = currency.toUpperCase();
  const x = spec[c] ?? [2, 2];
  return (amount: number) => to_atomic(amount, x);
};

/** display precision for a currency (0 for zero-decimal, 2 otherwise) */
export const currency_precision = (currency: string): number => {
  const [precision] = spec[currency.toUpperCase()] ?? [2, 2];
  return precision;
};

/** inverse of to_atomic — convert stripe smallest-unit amount to display amount */
export const from_stripe_amount = (
  amount: number,
  currency: string
): number => {
  const c = currency.toUpperCase();
  const [, atomic_units] = spec[c] ?? [2, 2];
  return atomic_units === 0 ? amount : amount / 10 ** atomic_units;
};

export const str_id = (raw: { id: string } | string | null) => {
  if (!raw) throw `invalid payment method ID: ${raw}`;
  if (typeof raw === "string") return raw;
  return raw.id;
};
