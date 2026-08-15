import type { Ref } from "react";
import { Form, href, Link } from "react-router";

interface ISignedInNotice {
  classes?: string;
  /** the address this browser is signed in as — not the one that was posted */
  email: string;
  /** the lead form focuses this on a refused submit, so the remedy is where
   * the caret lands rather than something to go find */
  ref?: Ref<HTMLDivElement>;
}

/** A submit refused because the browser holds somebody else's session. Nothing
 * was written and nothing is wrong with what was typed, so this is a fork in
 * the road rather than a validation failure — it takes the muted surface, not
 * the destructive one, and leads with the two ways out. */
export function SignedInNotice({ classes = "", email, ref }: ISignedInNotice) {
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={`${classes} grid gap-2.5 bg-muted border border-border rounded p-4 text-sm/relaxed focus-visible:outline-2 focus-visible:outline-offset-2`}
    >
      <p>
        This browser is signed in as{" "}
        <span className="font-semibold">{email}</span>, which isn't the address
        you entered. An application belongs to the account that starts it.
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <Link
          to={href("/register")}
          className="font-semibold text-primary hover:underline"
        >
          Continue with this account
        </Link>
        <Form method="post" action={href("/logout")}>
          <button
            type="submit"
            className="font-semibold text-primary hover:underline"
          >
            Sign out and use another address
          </button>
        </Form>
      </div>
    </div>
  );
}
