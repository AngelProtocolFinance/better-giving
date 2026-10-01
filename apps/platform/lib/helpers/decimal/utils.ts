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

/** `num` at 15 significant digits, which undoes the drift binary floating
 * point adds to a sum or product of decimals: 8 + 1.2 + 0.51 is
 * 9.709999999999999 and 1.005 * 100 is 100.49999999999999 */
export const snap = (num: number): number => +num.toPrecision(15);

/** `num` as a whole count of 10^-precision units, rounded half up, half down, or up */
export function to_units(
  num: number,
  precision: number,
  mode: "half_up" | "half_down" | "up" = "half_up"
): number {
  const scaled = snap(num * 10 ** precision);
  if (mode === "up") return Math.ceil(scaled);
  if (mode === "half_down") {
    const r = Math.ceil(scaled - 0.5);
    // ceil(-0.5) is -0, which formats as "-0"
    return r === 0 ? 0 : r;
  }
  return Math.round(scaled);
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
