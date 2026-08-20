import { Clipboard } from "@ark-ui/react/clipboard";
import { Check, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { unpack } from "#/helpers/unpack";

type Classes = string | { container?: string; icon?: string };

type Props = {
  text: string;
  classes?: Classes;
  size?: { copy?: number; check?: number } | number;
  children?: ReactNode;
};

const copy_wait_time = 700;

export function Copier({ text, classes, size, children }: Props) {
  const { container, icon } = unpack(classes);
  const { check = 16, copy = 16 } = size
    ? typeof size === "number"
      ? { check: size, copy: size }
      : size
    : {};
  return (
    <Clipboard.Root value={text} timeout={copy_wait_time} className="contents">
      {/* the name belongs on the trigger — the icons are the button's picture,
          not its label, and a name on an svg inside a button is not what a
          screen reader announces for the button. unconditional because no call
          site passes children today; a caller that does would need this to go
          conditional, or the label would shadow their visible text. */}
      <Clipboard.Trigger aria-label="Copy" className={`${container} relative`}>
        <Clipboard.Indicator
          className="contents"
          copied={
            <Check
              className={`${icon} text-success`}
              size={check}
              aria-hidden="true"
            />
          }
        >
          <Copy className={`${icon}`} size={copy} aria-hidden="true" />
        </Clipboard.Indicator>
        {children}
      </Clipboard.Trigger>
      {/* the checkmark swap is a picture, and a picture confirms nothing to a
          screen reader — zag's clipboard machine emits no status message of its
          own. the region is always mounted and only its text changes, because an
          element inserted at the same moment as its text is announced
          unreliably. outside the trigger so it is a status, not part of the
          button's name. */}
      <Clipboard.Context>
        {(api) => (
          <span role="status" className="sr-only">
            {api.copied ? "Copied to clipboard" : ""}
          </span>
        )}
      </Clipboard.Context>
    </Clipboard.Root>
  );
}
