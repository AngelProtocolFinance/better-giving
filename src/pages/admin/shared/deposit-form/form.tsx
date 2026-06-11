import { Dialog } from "@base-ui/react/dialog";
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
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Panel {...props} onClose={close} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
