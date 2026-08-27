import { Clipboard } from "@ark-ui/react/clipboard";
import { Check, Copy } from "lucide-react";
import { type ReactNode, useId } from "react";
import { unpack } from "../../helpers/unpack";

type Classes = string | { container?: string; icon?: string };

type Props = {
  text: string;
  classes?: Classes;
  size?: { copy?: number; check?: number } | number;
  children?: ReactNode;
  /** the trigger's accessible name. name what is being copied wherever a row
   * holds more than one control, so "Copy" alone doesn't have to carry it. */
  label?: string;
};

const copy_wait_time = 700;

export function Copier({ text, classes, size, children, label }: Props) {
  const { container, icon } = unpack(classes);
  const { check = 16, copy = 16 } = size
    ? typeof size === "number"
      ? { check: size, copy: size }
      : size
    : {};
  /* the icons are the button's picture, not its label, and a name on an svg
     inside a button is not what a screen reader announces for the button — so
     a glyph-only trigger needs a name of its own, and `label` sharpens it for
     a row where "Copy" alone does not say which thing.
     children are different: they are a VISIBLE label, and an aria-label over
     them replaces it rather than adding to it, which is wcag 2.5.3 and leaves
     voice control unable to say the words on the button. taking the name off
     is not reachable from props — zag names the trigger itself out of
     `translations.triggerLabel`, and both routes to unsetting it fail:
     `mergeProps` drops an undefined aria-label, and zag's `compact` recurses,
     so `translations: { triggerLabel: undefined }` arrives as `{}` and the
     default ("Copy to clipboard") stands either way. so the children are
     pointed AT instead — `aria-labelledby` outranks `aria-label` in the accname
     order, and names the button with exactly its own text. */
  const kids_id = useId();

  return (
    <Clipboard.Root value={text} timeout={copy_wait_time} className="contents">
      <Clipboard.Trigger
        aria-label={label ?? (children ? undefined : "Copy")}
        aria-labelledby={children ? kids_id : undefined}
        className={`${container} relative`}
      >
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
        {children != null && <span id={kids_id}>{children}</span>}
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
