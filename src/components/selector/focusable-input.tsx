import type { Ref } from "react";

export function FocusableInput({ ref }: { ref?: Ref<HTMLInputElement> }) {
  return (
    <input ref={ref} aria-hidden className="h-0 w-0 absolute" tabIndex={-1} />
  );
}
