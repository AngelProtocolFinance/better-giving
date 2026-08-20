import type { PropsWithChildren } from "react";

export function Separator({
  classes = "",
  children,
}: PropsWithChildren<{ classes?: string }>) {
  return (
    <p
      className={`flex items-center text-muted-fg text-sm before:content-[''] before:h-px before:w-full after:content-[''] after:h-px after:w-full before:bg-border after:bg-border  ${classes}`}
    >
      {children}
    </p>
  );
}
