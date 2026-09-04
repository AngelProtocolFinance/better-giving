import { Portal } from "@ark-ui/react/portal";
import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import { type ComponentProps, type ReactNode, useState } from "react";
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

interface Props {
  /** must be wrapped by Content */
  tip: ReactNode;
  children: React.JSX.Element;
}
export function Tooltip(props: Props) {
  const [open, set_open] = useState(false);
  return (
    <ArkTooltip.Root
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
      <ArkTooltip.Trigger onClick={() => set_open(true)} asChild>
        {props.children}
      </ArkTooltip.Trigger>
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
