import { CircleAlert } from "lucide-react";
import { href, Link, useFetcher } from "react-router";

type Props = { email: string };

export function Expired(props: Props) {
  const fetcher = useFetcher();

  return (
    <div className="grid justify-items-center w-full max-w-md px-6 sm:px-7 py-7 sm:py-8 bg-card border rounded">
      <div className="grid place-items-center size-16 sm:size-20 rounded-full bg-secondary">
        <CircleAlert className="size-8 sm:size-10 text-destructive" />
      </div>

      <h3 className="text-center text-xl sm:text-2xl font-bold mt-5">
        Link expired
      </h3>
      <p className="mt-3 max-sm:text-sm leading-relaxed text-center">
        This password reset link has expired or is no longer valid. Request a
        new one and it will be sent to{" "}
        <span className="font-medium">{props.email}</span>.
      </p>

      <fetcher.Form method="POST" className="w-full mt-6">
        <input type="hidden" name="email" value={props.email} />
        <button
          disabled={fetcher.state !== "idle"}
          type="submit"
          className="w-full h-12 sm:h-[52px] flex-center btn-primary rounded sm:text-lg font-bold"
        >
          {fetcher.state !== "idle" ? "Sending..." : "Resend reset email"}
        </button>
      </fetcher.Form>

      <Link
        to={href("/login")}
        className="mt-5 text-primary hover:text-primary active:text-primary max-sm:text-sm font-medium underline text-center"
      >
        Back to Sign In
      </Link>
    </div>
  );
}
