import { to_usd } from "#/helpers/to-usd";

interface Props {
  children: number;
  parens?: true;
  sign?: true;
  relative?: number;
  classes?: string;
  /** rendering on a `--destructive-subtle` band — plain `--destructive` ink
      misses the contrast floor there, so the negative branch darkens */
  tinted?: true;
}
export function Usd({
  classes = "",
  parens,
  relative = 0,
  sign,
  tinted,
  children: num,
}: Props) {
  const is_plus = num !== relative && num > relative;
  const is_minus = num !== relative && num < relative;

  if (parens && num === 0) return null;

  const minus_ink = tinted ? "text-destructive-subtle-fg" : "text-destructive";

  return (
    <span
      className={`${is_minus ? minus_ink : is_plus ? "text-success" : ""} ${classes}`}
    >
      {parens && "("}
      {is_plus && sign ? "+" : ""}
      {to_usd(num)}
      {parens && ")"}
    </span>
  );
}
