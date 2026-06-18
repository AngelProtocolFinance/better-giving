import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { useNavigate } from "react-router";
import { Panel } from "./panel";
import type { Props } from "./types";

export function Form(props: Props) {
  const navigate = useNavigate();

  function close() {
    navigate("..", { replace: true, preventScrollReset: true });
  }

  return (
    <Dialog.Root
      open={true}
      onOpenChange={(e) => {
        if (!e.open) close();
      }}
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Dialog.Positioner className="contents">
          <Panel {...props} onClose={close} />
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
