import { CircleCheck } from "lucide-react";
import { href, Link } from "react-router";
import type { Route } from "./+types/route";

export { loader } from "../_app.signup/loader";
export default function Page({ loaderData: to }: Route.ComponentProps) {
  return (
    <div className="grid justify-items-center w-full max-w-md px-6 sm:px-7 py-7 sm:py-8 bg-panel border rounded">
      <CircleCheck className="text-primary size-16 sm:size-20" />

      <h3 className="text-center text-xl sm:text-2xl font-bold mt-6">
        Account created successfully
      </h3>
      <p className="text-center max-sm:text-sm mt-2">
        You can now proceed to sign in to your account
      </p>

      <Link
        to={`${href("/login")}?redirect=${encodeURIComponent(to)}`}
        className="btn btn-lg btn-primary mt-9 w-full rounded"
      >
        Continue to Sign in
      </Link>
    </div>
  );
}
