import { flat_colors } from "@better-giving/brand/flat";
import type { ComponentProps } from "react";
import { Link as EmailLink } from "react-email";

export type LinkProps = ComponentProps<typeof EmailLink>;

/**
 * react-email's `Link` bakes `color: #067df7` into its own style object and
 * spreads the caller's after it, so a link with no explicit color renders that
 * blue rather than anything from the palette. every link in this package goes
 * through here; a caller's own `style` still wins, since it is spread last.
 */
export function Link({ style, ...props }: LinkProps) {
  return (
    <EmailLink {...props} style={{ color: flat_colors.primary, ...style }} />
  );
}
