import { useCallback } from "react";
import { type IPrompt, Prompt } from "../prompt/prompt";
import { type AskOpts, type AskProps, ask, use_ask } from "./ask";

/** everything `Prompt` renders; `ask` owns the rest of its props. */
type Content = Omit<IPrompt, "open" | "onClose" | "onExitComplete">;

function AskedPrompt({
  open,
  resolve,
  on_closed,
  ...content
}: Content & AskProps) {
  return (
    <Prompt
      {...content}
      open={open}
      // `Prompt` swallows this when `isDismissable` is false, so such a
      // prompt stays up until a keyed ask takes its slot.
      onClose={() => resolve()}
      onExitComplete={on_closed}
    />
  );
}

/**
 * raise a `Prompt` from a handler, an effect or a catch block.
 *
 * from a component that can unmount, reach for `use_ask_prompt` instead.
 */
export const ask_prompt = (content: Content, opts?: AskOpts) =>
  ask(AskedPrompt, content, opts);

/**
 * `ask_prompt` bound to the caller's lifetime — see `use_ask`.
 *
 * @example
 * const ask_prompt = use_ask_prompt();
 * catch (err) {
 *   ask_prompt(error_prompt(err, { context: "saving your payout account" }), {
 *     key: "payout-submit-error",
 *   });
 * }
 */
export function use_ask_prompt() {
  const ask = use_ask();
  return useCallback(
    (content: Content, opts?: AskOpts) => ask(AskedPrompt, content, opts),
    [ask]
  );
}
