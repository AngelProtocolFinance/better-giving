import { email_colors } from "@better-giving/brand/email";
import type { ComponentProps } from "react";
import { Hr as EmailHr } from "react-email";

export type HrProps = ComponentProps<typeof EmailHr>;

/**
 * Hr ships its own off-palette border color (`1px solid #eaeaea`) and spreads
 * the caller's style after it, so every call site otherwise has to override it
 * explicitly. the whole shorthand is restated here — overriding only
 * `borderTopColor` leaves the width and style on react-email's defaults.
 */
export function Hr({ style, ...props }: HrProps) {
  return (
    <EmailHr
      {...props}
      style={{ borderTop: `1px solid ${email_colors.border}`, ...style }}
    />
  );
}
