import { to_usd } from "@better-giving/ui/helpers";

interface Props {
  children: number;
  parens?: true;
  sign?: true;
  relative?: number;
  // marks a figure whose positive direction is money leaving, flipping which
  // side of `relative` counts as the gain. without it polarity is inferred
  // from the arithmetic sign alone, which holds only while every figure in a
  // block is a gain when positive — the invariant `bg-view.node.test.ts`
  // asserts for the details block.
  cost?: true;
  classes?: string;
}
export function Usd({
  classes = "",
  cost,
  parens,
  relative = 0,
  sign,
  children: num,
}: Props) {
  const is_above = num !== relative && num > relative;
  const is_below = num !== relative && num < relative;

  const is_gain = cost ? is_below : is_above;
  const is_loss = cost ? is_above : is_below;

  if (parens && num === 0) return null;

  return (
    <span
      className={`${is_loss ? "text-destructive-subtle-fg" : is_gain ? "text-success-subtle-fg" : ""} ${classes}`}
    >
      {parens && "("}
      {is_gain && sign ? "+" : ""}
      {to_usd(num)}
      {parens && ")"}
    </span>
  );
}
