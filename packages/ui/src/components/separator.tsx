import type { PropsWithChildren } from "react";

export function Separator({
  classes = "",
  children,
}: PropsWithChildren<{ classes?: string }>) {
  return (
    <p
      className={`flex items-center text-gray-11 text-sm before:content-[''] before:h-px before:w-full after:content-[''] after:h-px after:w-full before:bg-gray-6 after:bg-gray-6  ${classes}`}
    >
      {children}
    </p>
  );
}
