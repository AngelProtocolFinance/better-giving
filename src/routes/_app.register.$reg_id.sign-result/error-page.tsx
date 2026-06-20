import { CircleAlert } from "lucide-react";
import { href, Link, useFetcher } from "react-router";
import type { ErrorQueryParams } from "./types";

export default function ErrorPage(props: ErrorQueryParams) {
  const fetcher = useFetcher();

  const isRedirecting = fetcher.state === "submitting";
  return (
    <fetcher.Form method="POST">
      <div className="bg-destructive rounded-full aspect-square grid place-items-center mb-4 size-16">
        <CircleAlert size={30} className="text-destructive-fg" />
      </div>
      <h1 className="text-2xl uppercase text-center">Signing failed</h1>
      <p className="bg-muted p-4 text-sm text-muted-fg mt-4">
        {props.error}: {props.message}
      </p>
      <button
        name="signer_eid"
        value={props.signerEid}
        type="submit"
        disabled={isRedirecting}
        className="w-full max-w-105 btn btn-primary text-sm mt-6"
      >
        Retry
      </button>
      <Link
        className="w-full max-w-105 btn-secondary btn text-sm mt-4"
        to={href("/register/resume")}
        aria-disabled={isRedirecting}
      >
        Back
      </Link>
    </fetcher.Form>
  );
}
