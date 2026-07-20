import { Info, X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router";
import { CopyButton } from "#/components/copy-button";
import { HighlightedCode } from "#/components/highlighted-code";

type EmbedMode = "iframe" | "script";

interface EmbedModeContextValue {
  mode: EmbedMode;
  set_mode: (mode: EmbedMode) => void;
}

const EmbedModeContext = createContext<EmbedModeContextValue | null>(null);

interface EmbedModeProviderProps {
  children: ReactNode;
  initial_mode?: EmbedMode;
}

export function EmbedModeProvider({
  children,
  initial_mode = "iframe",
}: EmbedModeProviderProps) {
  const [mode, set_mode] = useState<EmbedMode>(initial_mode);

  return (
    <EmbedModeContext.Provider value={{ mode, set_mode }}>
      {children}
    </EmbedModeContext.Provider>
  );
}

export function useEmbedMode() {
  const context = useContext(EmbedModeContext);
  if (!context) {
    throw new Error("useEmbedMode must be used within an EmbedModeProvider");
  }
  return context;
}

export function EmbedModeTabs() {
  const { mode, set_mode } = useEmbedMode();

  return (
    <div className="inline-flex gap-2 text-xs font-medium">
      <button
        type="button"
        onClick={() => set_mode("iframe")}
        className={`transition-colors ${
          mode === "iframe"
            ? "text-neutral-700"
            : "text-neutral-400 hover:text-neutral-500"
        }`}
      >
        iframe
      </button>
      <span className="text-neutral-300">|</span>
      <button
        type="button"
        onClick={() => set_mode("script")}
        className={`transition-colors ${
          mode === "script"
            ? "text-neutral-700"
            : "text-neutral-400 hover:text-neutral-500"
        }`}
      >
        script
      </button>
    </div>
  );
}

function SetupModal({ id }: { id: string }) {
  const dialog_ref = useRef<HTMLDialogElement>(null);

  const script_snippet = `<script src="https://better.giving/form-embed.js" async></script>`;
  const container_snippet = `<div data-bg-form="${id}"></div>`;

  return (
    <>
      <button
        type="button"
        onClick={() => dialog_ref.current?.showModal()}
        className="font-medium underline hover:text-amber-900"
      >
        View setup instructions
      </button>

      <dialog
        ref={dialog_ref}
        className="p-0 rounded backdrop:bg-black/50 max-w-xl w-[90vw] fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 m-0"
      >
        <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">
            Script Embed Setup
          </h2>
          <form method="dialog">
            <button
              type="submit"
              className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500"
            >
              <X size={20} />
            </button>
          </form>
        </div>

        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto">
          <section className="space-y-4">
            <div>
              <h3 className="font-medium text-neutral-900">
                Step 1: Add the script
              </h3>
              <p className="text-sm text-neutral-600 mt-1">
                Add this script tag just before the closing{" "}
                <code className="bg-neutral-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  {"</body>"}
                </code>{" "}
                tag on your page.
              </p>
            </div>
            <div className="rounded text-sm border border-neutral-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-neutral-50 border-b border-neutral-200">
                <span className="text-xs text-neutral-500 font-medium">
                  HTML
                </span>
                <CopyButton text={script_snippet} />
              </div>
              <HighlightedCode
                code={script_snippet}
                lang="html"
                className="[&_pre]:p-4 [&_pre]:m-0 [&_pre]:overflow-x-auto"
                fallback_class_name="p-4 m-0 overflow-x-auto text-neutral-600"
              />
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="font-medium text-neutral-900">
                Step 2: Add the container
              </h3>
              <p className="text-sm text-neutral-600 mt-1">
                Place this element where you want the donation form to appear.
              </p>
            </div>
            <div className="rounded text-sm border border-neutral-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-neutral-50 border-b border-neutral-200">
                <span className="text-xs text-neutral-500 font-medium">
                  HTML
                </span>
                <CopyButton text={container_snippet} />
              </div>
              <HighlightedCode
                code={container_snippet}
                lang="html"
                className="[&_pre]:p-4 [&_pre]:m-0 [&_pre]:overflow-x-auto"
                fallback_class_name="p-4 m-0 overflow-x-auto text-neutral-600"
              />
            </div>
          </section>
        </div>
      </dialog>
    </>
  );
}

export function ScriptSetupBanner() {
  const { mode } = useEmbedMode();
  const params = useParams();
  const id = params.id as string;

  if (mode !== "script") return null;

  return (
    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
      <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
      <span className="text-amber-800">
        This snippet requires additional setup. <SetupModal id={id} />
      </span>
    </div>
  );
}

export type { EmbedMode };
