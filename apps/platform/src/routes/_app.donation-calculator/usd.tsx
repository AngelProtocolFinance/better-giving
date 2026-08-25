import { to_usd } from "@better-giving/ui/helpers";

interface Props {
  children: number;
  parens?: true;
  sign?: true;
  relative?: number;
  classes?: string;
}
export function Usd({
  classes = "",
  parens,
  relative = 0,
  sign,
  children: num,
}: Props) {
  const is_plus = num !== relative && num > relative;
  const is_minus = num !== relative && num < relative;

  if (parens && num === 0) return null;

  return (
    <span
      className={`${is_minus ? "text-destructive-subtle-fg" : is_plus ? "text-success-subtle-fg" : ""} ${classes}`}
    >
      {parens && "("}
      {is_plus && sign ? "+" : ""}
      {to_usd(num)}
      {parens && ")"}
    </span>
  );
}
