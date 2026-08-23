import { LoadText } from "@better-giving/ui";
import type { ButtonHTMLAttributes } from "react";

export function ContinueBtn({
  className,
  type = "button",
  text = "Continue",
  is_loading,
  loading_text,
  disabled,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  text?: string;
  /** in flight: spinner + `loading_text`, and unpressable */
  is_loading?: boolean;
  loading_text?: string;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || is_loading}
      className={`btn btn-form-primary ${is_loading ? "pending" : ""} ${className}`}
    >
      <LoadText text={loading_text} is_loading={is_loading}>
        {text}
      </LoadText>
    </button>
  );
}
