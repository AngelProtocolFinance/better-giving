import { PasswordInput as Ark } from "@ark-ui/react/password-input";
import { Eye, EyeOff, Lock } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { ornament_end_cls } from "./ornament";

type El = HTMLInputElement;
interface Props
  extends Omit<InputHTMLAttributes<El>, "className" | "type" | "autoComplete"> {
  error?: string;
  ref?: React.Ref<El>;
}

export function PasswordInput({ error, ref, ...rest }: Props) {
  return (
    <Ark.Root>
      <Ark.Control className="relative">
        <Lock
          className="text-gray-11 absolute top-1/2 -translate-y-1/2 left-4"
          size={20}
        />
        <Ark.Input
          ref={ref}
          {...rest}
          autoComplete="current-password"
          // both edges reserve their ornament's lane: the lock on the left,
          // the visibility toggle on the right. without the right one, a long
          // password runs under the eye — and the eye's hit area is the field's
          // full right edge, so a click meant to place the caret reveals it.
          className="w-full h-full field-input pl-12 pr-12"
          aria-invalid={!!error}
        />
        <Ark.VisibilityTrigger
          className={`${ornament_end_cls} text-gray-11 hover:text-gray-11 active:text-gray-12 rounded`}
        >
          <Ark.Indicator fallback={<Eye size={20} />}>
            <EyeOff size={20} />
          </Ark.Indicator>
        </Ark.VisibilityTrigger>
      </Ark.Control>
      {error && <p className="field-err mt-1 empty:hidden">{error}</p>}
    </Ark.Root>
  );
}
