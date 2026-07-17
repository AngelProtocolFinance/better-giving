import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import type { PropsWithChildren } from "react";
import { useNavigate } from "react-router";

interface IRouteModal extends PropsWithChildren {
  /** navigate target on close — default ".." (parent route) */
  to?: string;
}

/**
 * route-as-modal wrapper. owns Dialog.Root + Portal + Backdrop + Positioner
 * and closes by navigating up. caller renders its own <Dialog.Content>.
 */
export function RouteModal({ to = "..", children }: IRouteModal) {
  const navigate = useNavigate();
  return (
    <Dialog.Root
      open={true}
      onOpenChange={(e) => {
        if (!e.open) navigate(to, { replace: true, preventScrollReset: true });
      }}
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Dialog.Positioner className="contents">{children}</Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
