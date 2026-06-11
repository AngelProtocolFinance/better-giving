import { PreviewCard } from "@base-ui/react/preview-card";
import { type ComponentProps, type ReactNode, useState } from "react";
import { ArrowSvg } from "./arrow-svg";

export function Arrow() {
  return (
    <PreviewCard.Arrow className="tooltip-arrow">
      <ArrowSvg />
    </PreviewCard.Arrow>
  );
}

const popup_anim =
  "origin-[var(--transform-origin)] transition-[opacity,scale] duration-150 data-[starting-style]:opacity-0 data-[starting-style]:scale-90 data-[ending-style]:opacity-0 data-[ending-style]:scale-90";

export function Content({
  className = "",
  ...props
}: ComponentProps<typeof PreviewCard.Popup>) {
  return (
    <PreviewCard.Popup className={`${popup_anim} ${className}`} {...props} />
  );
}

interface Props {
  /** must be wrapped by Content */
  tip: ReactNode;
  children: React.JSX.Element;
}
export function HoverCard(props: Props) {
  const [handle] = useState(() => PreviewCard.createHandle());
  return (
    <>
      <PreviewCard.Trigger
        handle={handle}
        delay={100}
        closeDelay={200}
        render={props.children}
      />
      <PreviewCard.Root handle={handle}>
        <PreviewCard.Portal>
          <PreviewCard.Positioner sideOffset={5} collisionPadding={16}>
            {props.tip}
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      </PreviewCard.Root>
    </>
  );
}
