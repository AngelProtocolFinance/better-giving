import { Portal } from "@ark-ui/react/portal";
import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import {
  type ComponentProps,
  isValidElement,
  type ReactNode,
  useId,
  useState,
} from "react";
import { popup_anim, popup_shell } from "./popup";

// no-op: the arrow is rendered by `Tooltip` itself
// as a sibling of `Content` inside `Positioner` (the only structure ark-ui
// will position via popper). callers may render `<Arrow />`; it
// renders nothing.
export function Arrow() {
  return null;
}

export function Content({
  className = "",
  ...props
}: ComponentProps<typeof ArkTooltip.Content>) {
  return (
    <ArkTooltip.Content
      className={`${popup_anim} ${popup_shell} ${className}`}
      {...props}
    />
  );
}

// a child of one of these tags is focusable and named on its own, so it becomes
// the trigger itself; anything else (an svg, a span) is wrapped in a button.
const FOCUSABLE = new Set(["button", "a", "input", "select", "textarea"]);

// the ring goes on the glyph, not the button: a glyph positioned `absolute`
// leaves its wrapping button with no box to outline.
const wrap_trigger =
  "outline-0 focus-visible:*:outline-2 focus-visible:*:outline-ring focus-visible:*:outline-offset-2";

interface Props {
  /** must be wrapped by Content */
  tip: ReactNode;
  /** a button, link or input is the trigger itself; any other element is
   * wrapped in a button named by its own text followed by the tip's */
  children: React.JSX.Element;
}
export function Tooltip(props: Props) {
  const [open, set_open] = useState(false);
  const trigger_id = useId();
  const label_id = useId();
  const as_child =
    typeof props.children.type === "string" &&
    FOCUSABLE.has(props.children.type);

  return (
    <ArkTooltip.Root
      ids={as_child ? undefined : { trigger: trigger_id }}
      open={open}
      onOpenChange={(e) => set_open(e.open)}
      openDelay={50}
      closeOnClick={false}
      // unmount positioner (and arrow) once content's exit animation ends,
      // otherwise the arrow lingers after content hides.
      lazyMount
      unmountOnExit
      positioning={{ gutter: 4 }}
    >
      {as_child ? (
        <ArkTooltip.Trigger onClick={() => set_open(true)} asChild>
          {props.children}
        </ArkTooltip.Trigger>
      ) : (
        <ArkTooltip.Trigger
          type="button"
          onClick={() => set_open(true)}
          className={wrap_trigger}
          // zag describes the trigger by the content only while it is open,
          // and the content is unmounted when closed — so the name comes from
          // a hidden copy of the tip, which `aria-labelledby` reads regardless.
          // the self-reference keeps any visible text first in the name.
          aria-labelledby={`${trigger_id} ${label_id}`}
          // biome-ignore lint/a11y/useValidAriaValues: empty, not undefined — zag's merge keeps its own value over an undefined one, and the open tip would be read a second time after the name
          aria-describedby=""
        >
          {props.children}
        </ArkTooltip.Trigger>
      )}
      {!as_child && (
        // outside the button: a copy inside it would be consumed (and skipped,
        // being hidden) by the self-reference before its own id is reached
        <span id={label_id} hidden>
          {isValidElement<{ children?: ReactNode }>(props.tip)
            ? props.tip.props.children
            : props.tip}
        </span>
      )}
      <Portal>
        <ArkTooltip.Positioner className="[--arrow-size:10px] [--arrow-background:var(--panel)]">
          <ArkTooltip.Arrow>
            <ArkTooltip.ArrowTip className="border-l border-t border-gray-6" />
          </ArkTooltip.Arrow>
          {props.tip}
        </ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.Root>
  );
}
