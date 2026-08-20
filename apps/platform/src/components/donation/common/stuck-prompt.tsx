import type { IPrompt } from "@better-giving/ui";
import type { IDonationDest } from "./return-url";

interface IStuckMsg {
  dest: IDonationDest;
  classes?: string;
}

/**
 * the donation went through and the browser never left the page. worded as
 * the success it is — a donor who reads this as a failure donates twice — and
 * the only action offered is the trip that didn't happen.
 */
export function StuckMsg({ dest, classes = "" }: IStuckMsg) {
  return (
    <p className={classes}>
      Your donation went through — thank you. We couldn't open your receipt
      automatically.{" "}
      <a
        // `--form-primary` is set on #donation-container, which the prompt is
        // portaled out of: there it falls back to the :root brand color, and
        // inline in the form it picks up the merchant's accent.
        className="underline text-form-primary"
        href={dest.url}
        // a merchant's own page may refuse to load in the embed, so theirs
        // opens in a tab of its own. ours is same-origin and stays put.
        {...(dest.is_custom
          ? { target: "_blank", rel: "noopener" }
          : undefined)}
      >
        View your receipt
      </a>
    </p>
  );
}

/** the same message as a modal — it arrives from a timer, long after the
 * donor's last click, so it has to interrupt rather than wait to be noticed. */
export function stuck_prompt(dest: IDonationDest): IPrompt {
  return {
    type: "success",
    children: <StuckMsg dest={dest} />,
  };
}
