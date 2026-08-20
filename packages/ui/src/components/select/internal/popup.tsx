import { Portal } from "@ark-ui/react/portal";
import type { ComponentType, CSSProperties, ReactNode, RefObject } from "react";
import { popup_cls, popup_motion_cls, popup_scrollbar_cls } from "../classes";

interface IPopup {
  /**
   * ark's positioner + content for whichever machine drives this popup. select
   * and combobox expose the same two parts under the same names and differ
   * only in the machine behind them, so the portal/shell sandwich is written
   * once and handed the pair.
   */
  parts: {
    Positioner: ComponentType<{ children?: ReactNode }>;
    Content: ComponentType<{
      className?: string;
      style?: CSSProperties;
      children?: ReactNode;
    }>;
  };
  /**
   * from `use_dialog_container` — the enclosing dialog's content element, or
   * undefined for the default body portal. never a caller's concern: portaled
   * to body from inside a dialog, the popup lands in the aria-hidden sweep and
   * under the backdrop.
   */
  container: RefObject<HTMLElement | null> | undefined;
  /**
   * css custom properties re-applied across the portal boundary. the embedded
   * donation form's tenant accents don't inherit into a body portal.
   */
  vars?: Record<string, string | undefined>;
  /** the popup tracks its control unless the host says otherwise. */
  width?: string;
  classes?: string;
  children: ReactNode;
}

export function Popup({ parts: { Positioner, Content }, ...p }: IPopup) {
  return (
    <Portal container={p.container}>
      <Positioner>
        <Content
          style={p.vars as CSSProperties | undefined}
          className={`${popup_cls} ${popup_scrollbar_cls} ${popup_motion_cls} ${
            p.width ?? "w-(--reference-width)"
          } ${p.classes ?? ""}`}
        >
          {p.children}
        </Content>
      </Positioner>
    </Portal>
  );
}
