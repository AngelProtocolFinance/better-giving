import { Eye, EyeOff, Lock } from "lucide-react";
import { type InputHTMLAttributes, useState } from "react";

type El = HTMLInputElement;
interface Props
  extends Omit<InputHTMLAttributes<El>, "className" | "type" | "autoComplete"> {
  error?: string;
  ref?: React.Ref<El>;
}

export function PasswordInput({ error, ref, ...rest }: Props) {
  const [isPasswordShown, setIsPasswordShown] = useState(false);

  return (
    <div>
      <div className="relative">
        <Lock
          className="text-muted-fg absolute top-1/2 -translate-y-1/2 left-4"
          size={20}
        />
        <input
          ref={ref}
          {...rest}
          type={isPasswordShown ? "text" : "password"}
          autoComplete="current-password"
          className="w-full h-full field-input pl-12"
          aria-invalid={!!error}
        />
        <button
          type="button"
          className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-fg hover:text-muted-fg active:text-fg rounded "
          onClick={() => setIsPasswordShown((prev) => !prev)}
        >
          {isPasswordShown ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      {error && <p className="field-err mt-1 empty:hidden">{error}</p>}
    </div>
  );
}
