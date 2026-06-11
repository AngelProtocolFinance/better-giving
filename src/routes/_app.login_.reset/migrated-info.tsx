import { KeyRound, Mail } from "lucide-react";
import { href, Link } from "react-router";

type Props = { email: string; to: string };

export function MigratedInfo(props: Props) {
  return (
    <div className="grid justify-items-center w-full max-w-md px-6 sm:px-7 py-7 sm:py-8 bg-card border rounded">
      <div className="grid place-items-center size-16 sm:size-20 rounded-full bg-secondary">
        <KeyRound className="size-8 sm:size-10 text-primary" />
      </div>

      <h3 className="text-center text-xl sm:text-2xl font-bold mt-5">
        Welcome back!
      </h3>
      <p className="mt-3 max-sm:text-sm leading-relaxed text-center">
        We've upgraded our platform and need you to set a new password to keep
        your account secure.
      </p>

      <div className="mt-5 w-full rounded bg-secondary/60 px-4 py-3 flex items-start gap-3">
        <Mail className="size-5 shrink-0 text-primary mt-0.5" />
        <p className="max-sm:text-sm leading-relaxed">
          A reset link was sent to{" "}
          <span className="font-medium">{props.email}</span>. Check your inbox
          and spam folder.
        </p>
      </div>

      <p className="mt-4 text-xs text-muted-fg text-center">
        This is a one-time step — once you set your password, you can log in
        normally.
      </p>

      <Link
        to={`${href("/login")}?redirect=${props.to}`}
        className="flex-center mt-6 w-full btn-primary h-12 sm:h-[52px] rounded sm:text-lg font-bold"
      >
        Back to Sign In
      </Link>
    </div>
  );
}
