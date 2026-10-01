import { PasswordInput as Ark } from "@ark-ui/react/password-input";
import { Eye, EyeOff, Lock } from "lucide-react";
import { type InputHTMLAttributes, useId } from "react";
import { ornament_end_cls } from "./ornament";

type El = HTMLInputElement;
interface Props
  extends Omit<InputHTMLAttributes<El>, "className" | "type" | "autoComplete"> {
  /** `"new-password"` on a signup or reset field, so the password manager
   * offers to generate and save one instead of autofilling the old one */
  autoComplete?: "current-password" | "new-password";
  label?: string;
  error?: string;
  ref?: React.Ref<El>;
}

export function PasswordInput({
  autoComplete = "current-password",
  label,
  error,
  ref,
  ...rest
}: Props) {
  const error_id = useId();
  return (
    <Ark.Root autoComplete={autoComplete} invalid={!!error}>
      {label && <Ark.Label className="label mb-1">{label}</Ark.Label>}
      <Ark.Control className="relative">
        <Lock className="text-gray-11 absolute top-1/2 -translate-y-1/2 left-4 icon-xl" />
        <Ark.Input
          ref={ref}
          {...rest}
          // both edges reserve their ornament's lane: the lock on the left,
          // the visibility toggle on the right. without the right one, a long
          // password runs under the eye — and the eye's hit area is the field's
          // full right edge, so a click meant to place the caret reveals it.
          className="w-full h-full field-input pl-12 pr-12"
          // see `field.tsx`: the errormessage relationship is the correct one and
          // the describedby is the one every screen reader reads
          aria-errormessage={error ? error_id : undefined}
          aria-describedby={error ? error_id : undefined}
        />
        <Ark.VisibilityTrigger
          className={`${ornament_end_cls} text-gray-11 hover:text-gray-11 active:text-gray-12 rounded`}
        >
          <Ark.Indicator fallback={<Eye className="icon-xl" />}>
            <EyeOff className="icon-xl" />
          </Ark.Indicator>
        </Ark.VisibilityTrigger>
      </Ark.Control>
      {error && (
        <p id={error_id} className="field-err mt-1 empty:hidden">
          {error}
        </p>
      )}
    </Ark.Root>
  );
}
