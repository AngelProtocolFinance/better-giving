import { CircleCheck } from "lucide-react";
import { href, Link } from "react-router";

export function Success(props: { to: string }) {
  return (
    <div className="grid justify-items-center w-full max-w-md px-6 sm:px-7 py-7 sm:py-8 bg-card border rounded">
      <CircleCheck className="text-primary size-16 sm:size-20" />

      <h3 className="text-center text-xl sm:text-2xl font-bold mt-6">
        Password reset successful
      </h3>
      <p className="text-center max-sm:text-sm mt-2">
        Your account’s password has been successfully updated.
      </p>

      <Link
        to={`${href("/login")}?redirect=${props.to}`}
        className="flex-center mt-9 w-full btn-primary h-12 sm:h-[52px] rounded sm:text-lg font-bold"
      >
        Back to Sign in
      </Link>
    </div>
  );
}
