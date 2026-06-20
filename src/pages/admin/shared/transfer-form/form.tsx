import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { useNavigate } from "react-router";
import { Panel } from "./panel";
import type { Props } from "./types";

export function Form(props: Props) {
  const navigate = useNavigate();

  return (
    <Dialog.Root
      open={true}
      onOpenChange={(e) => {
        if (!e.open)
          navigate("..", { replace: true, preventScrollReset: true });
      }}
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Dialog.Positioner className="contents">
          <Panel {...props} />
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
