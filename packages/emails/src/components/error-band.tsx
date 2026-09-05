import { flat_colors } from "@better-giving/brand/flat";
import type { ComponentProps } from "react";
import { Text } from "react-email";

export type ErrorBandProps = ComponentProps<typeof Text>;

/**
 * a reason relayed from elsewhere — a payment processor's error, a reviewer's
 * rejection note — set apart on its own fill so the reader sees it is quoted
 * rather than written by us. the fill carries the emphasis, so the text itself
 * stays regular weight.
 */
export function ErrorBand({ style, ...props }: ErrorBandProps) {
  return (
    <Text
      {...props}
      style={{
        backgroundColor: flat_colors.destructive_subtle,
        padding: "20px",
        // the subtle pair: flat_colors.destructive only measures 3.92:1 on this fill
        color: flat_colors.destructive_subtle_fg,
        ...style,
      }}
    />
  );
}
