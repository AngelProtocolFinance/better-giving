import { CircleCheck } from "lucide-react";
import { Link } from "react-router";
import { back_to_login } from "./back-link";

export function Success(props: { to: string }) {
  return (
    <div className="solo-card justify-items-center">
      <CircleCheck className="text-primary size-16 sm:size-20" />

      <h3 className="text-center text-xl sm:text-2xl font-bold mt-6">
        Password reset successful
      </h3>
      <p className="text-center max-sm:text-sm mt-2">
        Your account’s password has been successfully updated.
      </p>

      <Link
        to={back_to_login(props.to)}
        className="btn btn-lg btn-primary mt-9 w-full"
      >
        Back to Sign in
      </Link>
    </div>
  );
}
