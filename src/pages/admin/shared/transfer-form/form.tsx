import { Dialog } from "@base-ui/react/dialog";
import { useNavigate } from "react-router";
import { Panel } from "./panel";
import type { Props } from "./types";

export function Form(props: Props) {
  const navigate = useNavigate();

  return (
    <Dialog.Root
      open={true}
      onOpenChange={(open) => {
        if (!open) navigate("..", { replace: true, preventScrollReset: true });
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Panel {...props} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
