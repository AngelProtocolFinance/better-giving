import {
  Toaster as ArkToaster,
  createToaster,
  Toast,
} from "@ark-ui/react/toast";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

// global manager — usable outside the react tree
const toaster = createToaster({
  placement: "bottom-end",
  overlap: true,
  gap: 8,
});

export function show_toast(opts: {
  type?: "success" | "error" | "info";
  message: string;
}) {
  toaster.create({ description: opts.message, type: opts.type });
}

const icons: Record<string, React.ReactNode> = {
  success: <CircleCheck size={18} className="text-success shrink-0" />,
  error: <CircleAlert size={18} className="text-destructive shrink-0" />,
  info: <Info size={18} className="text-primary shrink-0" />,
};

export function Toaster({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ArkToaster
        toaster={toaster}
        className="fixed bottom-4 right-4 z-50 w-[356px] max-w-[calc(100vw-2rem)] outline-none"
      >
        {(toast) => (
          <Toast.Root className="bg-popover text-fg border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out">
            {toast.type && icons[toast.type]}
            <Toast.Description className="text-sm flex-1">
              {toast.description}
            </Toast.Description>
            <Toast.CloseTrigger className="text-muted-fg hover:text-fg shrink-0">
              <X size={16} />
            </Toast.CloseTrigger>
          </Toast.Root>
        )}
      </ArkToaster>
    </>
  );
}
