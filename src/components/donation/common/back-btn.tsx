import { ChevronLeft } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export function BackBtn({
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      {...props}
      className={`flex relative -left-1.5 text-sm items-center font-medium text-(--form-primary) hover:underline disabled:text-muted-fg aria-disabled:text-muted-fg ${className}`}
    >
      <ChevronLeft size={18} />
      <span>Go Back</span>
    </button>
  );
}
