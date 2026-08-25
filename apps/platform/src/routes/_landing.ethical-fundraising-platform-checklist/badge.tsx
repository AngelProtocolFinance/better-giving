import type { PropsWithChildren } from "react";

export type Tone = "neutral" | "warning" | "success";

/* filled chip + its own -fg. this is the one warning treatment that is NOT the
   subtle band: --warning against --warning-fg measures 6.97:1, while the band
   shape (bg-warning-subtle / text-warning-subtle-fg) is for a tinted surface
   carrying body copy. see packages/brand/design-system.md. */
const TONES: Record<Tone, string> = {
  neutral: "bg-gray-3 text-gray-11",
  warning: "bg-warning text-warning-fg",
  success: "bg-success text-success-fg",
};

interface IBadge {
  tone?: Tone;
  classes?: string;
}

/** semantic status only — never decorative color */
export function Badge({
  tone = "neutral",
  classes = "",
  children,
}: PropsWithChildren<IBadge>) {
  return (
    <span
      className={`${classes} ${TONES[tone]} inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium`}
    >
      {children}
    </span>
  );
}
