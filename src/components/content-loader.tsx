import type { HTMLAttributes } from "react";

export function ContentLoader({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={`${className} bg-muted animate-pulse rounded`} />
  );
}
