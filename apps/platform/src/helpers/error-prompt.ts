import type { ReactNode } from "react";
import { emails } from "@/constants/common";
import { report_error } from "@/errors/report";

type Generic = {
  /**
   * context in present participle
   * @example sending message
   * @example loading resouce
   */
  context?: string;
};
type DisplayType = "parsed" | Generic | { custom: ReactNode };

function parse_error(error: unknown): string | undefined {
  if (typeof error === "string") return error;

  if (typeof error === "object" && error != null) {
    if ("message" in error) return parse_error(error.message);
    if ("data" in error) return parse_error(error.data);
    if ("error" in error) return parse_error(error.error);
  }

  if (error instanceof Error) return error.message;
}
const generic_msg = (context?: string) =>
  `An unexpected error occurred${
    context ? ` while ${context} ` : " "
  }and has been reported. Please get in touch with ${emails.hi} if the problem persists.`;

/**
 * the processor rejected what the donor typed — a bad cvc, a declined card, an
 * amount under the currency minimum. the form shows them the message and stays
 * usable, so nothing here is broken and nobody needs paging. `is_user_error` in
 * `@/errors/report` already drops the 4xx server equivalent; this is the client
 * -side half of the same rule.
 *
 * only for a message the donor can act on — anything we can't attribute to
 * their input goes through `error_prompt`.
 */
export const user_error_prompt = (error: unknown) => ({
  type: "error" as const,
  children: parse_error(error),
});

export const error_prompt = (error: unknown, display?: DisplayType) => {
  report_error(error);
  const disp = display || {};
  return {
    type: "error" as const,
    children:
      disp === "parsed"
        ? parse_error(error)
        : "custom" in disp
          ? disp.custom
          : generic_msg(disp.context),
  };
};

/**
 * a tagged failure read off `fetcher.data` — `resp.fail` in `@/helpers/https`
 * returns json so the status survives react-router's boundary, which strips a
 * bare `Response` down to its body text.
 *
 * a 4xx is the user's to act on and shows its own message; anything else is
 * ours, so it gets the generic line and is reported. same split `is_user_error`
 * makes on the server.
 */
export const submit_error_prompt = (
  data: { status?: unknown; message?: unknown },
  display?: DisplayType
) => {
  const s = data.status;
  return typeof s === "number" && s >= 400 && s < 500
    ? user_error_prompt(data)
    : error_prompt(data, display);
};
