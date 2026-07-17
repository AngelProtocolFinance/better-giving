import { useFetcher } from "react-router";
import { useRemixForm } from "remix-hook-form";
import { PasswordInput } from "#/components/form";
import type { IPasswordSchema } from "./schema";

type Props = {
  email: string;
  token: string;
};

export function SetPasswordForm(props: Props) {
  const fetcher = useFetcher();
  const {
    register,
    formState: { errors },
  } = useRemixForm<IPasswordSchema>({ fetcher });

  return (
    <fetcher.Form
      method="POST"
      className="grid w-full max-w-md px-6 sm:px-7 py-7 sm:py-8 bg-card border rounded"
    >
      <input type="hidden" name="email" value={props.email} />
      <input type="hidden" name="token" value={props.token} />
      <h3 className="text-center text-xl sm:text-2xl font-bold">
        Set new password
      </h3>
      <p className="text-center max-sm:text-sm mt-2">
        Enter a new password for{" "}
        <span className="font-medium">{props.email}</span>
      </p>

      <div className="mt-6 grid gap-3">
        <PasswordInput
          {...register("password")}
          error={errors.password?.message}
          placeholder="New Password"
        />
        <PasswordInput
          {...register("password_confirmation")}
          error={errors.password_confirmation?.message}
          placeholder="Confirm New Password"
        />
      </div>

      <div className="mt-6 text-xs leading-5">
        In order to protect your account, make sure your password:
        <ul className="list-disc list-inside">
          <li className="ml-2">Has at least 8 characters</li>
          <li className="ml-2">Contains at least 1 number</li>
          <li className="ml-2">Contains at least 1 special character</li>
          <li className="ml-2">Contains at least 1 uppercase letter</li>
          <li className="ml-2">Contains at least 1 lowercase letter</li>
        </ul>
      </div>

      <button
        name="intent"
        value="confirm"
        disabled={fetcher.state !== "idle"}
        type="submit"
        className="mt-6 w-full h-12 sm:h-[52px] flex-center btn-primary rounded sm:text-lg font-bold"
      >
        Confirm
      </button>
    </fetcher.Form>
  );
}
