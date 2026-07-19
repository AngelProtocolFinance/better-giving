import type { ButtonHTMLAttributes } from "react";

export function ContinueBtn({
  className,
  type = "button",
  text = "Continue",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  text?: string;
}) {
  return (
    <button
      {...props}
      type={type}
      className={`btn btn-form-primary ${className}`}
    >
      {text}
    </button>
  );
}
