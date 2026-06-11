import { Toast } from "@base-ui/react/toast";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

// global manager — usable outside the react tree
const toast_manager = Toast.createToastManager();

export function show_toast(opts: {
  type?: "success" | "error" | "info";
  message: string;
}) {
  toast_manager.add({ description: opts.message, type: opts.type });
}

const icons: Record<string, React.ReactNode> = {
  success: <CircleCheck size={18} className="text-success shrink-0" />,
  error: <CircleAlert size={18} className="text-destructive shrink-0" />,
  info: <Info size={18} className="text-primary shrink-0" />,
};

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 w-[356px] max-w-[calc(100vw-2rem)] outline-none">
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className="bg-popover text-fg border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 data-[swipe-direction]:transition-transform data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[starting-style]:translate-x-full transition-all duration-200"
          >
            {toast.type && icons[toast.type]}
            <Toast.Description className="text-sm flex-1">
              {toast.description}
            </Toast.Description>
            <Toast.Close className="text-muted-fg hover:text-fg shrink-0">
              <X size={16} />
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

export function Toaster({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider toastManager={toast_manager}>
      {children}
      <ToastList />
    </Toast.Provider>
  );
}
