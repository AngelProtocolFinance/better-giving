/** wrapper of toLocalString, to use in tests to defined fraction digits*/
export function toPreciseLocaleString(num: number, precision: number) {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

function fmt(
  num: number | string,
  precision: number,
  roundingMode: "trunc" | "expand"
): string {
  return new Intl.NumberFormat("en-US", {
    useGrouping: false,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
    roundingMode,
  }).format(+num);
}

/** round down
 * @param precision - default: `2`
 */
export function rd(num: number | string, precision = 2): string {
  return fmt(num, precision, "trunc");
}

/** round down to num
 *  @param precision - default: `2`
 *
 */
export function rd2num(num: number | string, precision = 2): number {
  return +rd(num, precision);
}

/** convert numbers to user's number format with precision defined
 * @param precision - default: `2`
 * @param truncate - default: `false`, whether to shorten large numbers (e.g. 1,200 -> 1.2K)
 *
 */
export function humanize(
  num: number | string,
  precision = 2,
  truncate = false
) {
  const val = +num;
  const [truncated, suffix] = truncate ? shorten(val) : [val, ""];
  //set local to undefined to use user's default format
  return (
    toPreciseLocaleString(rd2num(truncated, precision), precision) + suffix
  );
}

/** appropriate number of decimals depending on usd value
 *  e.g. (1usd -> 1usd), 100 cents per usd -> 2 decimals
 *  e.g. (100,000usd -> 1btc), 10,000,000 cents per btc -> 6 decimals
 *  @param max_decimals - default: `2`
 */
export function vdec(usd_per_unit: number, max_decimals = 2) {
  //get `x` such that (10^x)cents = rate
  const x = Math.log10(usd_per_unit / 0.01);
  // make sure display digits is less than token decimals
  return Math.floor(Math.min(max_decimals, Math.max(x, 0)));
}

export const usdpu = (amount: number, usd_value: number) => {
  return amount > 0 ? usd_value / amount : 0;
};

/** round up to approriate number of decimals depending on value
 *  @param max_decimals - default: `2`
 *
 */
export function ru_vdec(
  amount: number | string,
  usd_per_unit: number,
  max_decimals = 2
) {
  return fmt(amount, vdec(usd_per_unit, max_decimals), "expand");
}

export function rd_vdec(
  amount: number | string,
  usd_per_unit: number,
  max_decimals = 2
) {
  return fmt(amount, vdec(usd_per_unit, max_decimals), "trunc");
}

function shorten(num: number): [number, string] {
  const abs = Math.abs(num);
  if (abs >= 1e9) return [num / 1e9, "B"];
  if (abs >= 1e6) return [num / 1e6, "M"];
  if (abs >= 1e3) return [num / 1e3, "K"];
  return [num, ""];
}
