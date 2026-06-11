import { Mail } from "lucide-react";
import { href, Link } from "react-router";

type Props = { email: string; to: string };

export function CheckEmail(props: Props) {
  return (
    <div className="grid justify-items-center w-full max-w-md px-6 sm:px-7 py-7 sm:py-8 bg-card border rounded">
      <div className="grid place-items-center size-16 sm:size-20 rounded-full bg-secondary">
        <Mail className="size-8 sm:size-10 text-primary" />
      </div>

      <h3 className="text-center text-xl sm:text-2xl font-bold mt-5">
        Check your email
      </h3>
      <p className="mt-3 max-sm:text-sm leading-relaxed text-center">
        We've sent a password reset link to{" "}
        <span className="font-medium">{props.email}</span>. Check your inbox and
        spam folder, then click the link to set your new password.
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
