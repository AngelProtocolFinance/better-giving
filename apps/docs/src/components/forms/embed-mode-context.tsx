import { Copier, Modal } from "@better-giving/ui";
import { Info, X } from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";
import { useParams } from "react-router";
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
          mode === "iframe" ? "text-gray-12" : "text-gray-11 hover:text-gray-12"
        }`}
      >
        iframe
      </button>
      <span className="text-gray-6">|</span>
      <button
        type="button"
        onClick={() => set_mode("script")}
        className={`transition-colors ${
          mode === "script" ? "text-gray-12" : "text-gray-11 hover:text-gray-12"
        }`}
      >
        script
      </button>
    </div>
  );
}

function SetupModal({ id }: { id: string }) {
  const [open, set_open] = useState(false);

  const script_snippet = `<script src="https://better.giving/form-embed.js" async></script>`;
  const container_snippet = `<div data-bg-form="${id}"></div>`;

  return (
    <>
      <button
        type="button"
        onClick={() => set_open(true)}
        className="font-medium underline hover:text-gray-12"
      >
        View setup instructions
      </button>

      <Modal
        open={open}
        onClose={() => set_open(false)}
        size="md"
        classes="bg-panel text-gray-12"
      >
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-12">
            Script Embed Setup
          </h2>
          <button
            type="button"
            onClick={() => set_open(false)}
            aria-label="Close setup instructions"
            className="p-1.5 rounded hover:bg-secondary text-gray-11"
          >
            <X size={20} />
          </button>
        </div>

        {/* the tier already caps the box at 90dvh and scrolls it — the heading
            scrolls with the body, as it does on every platform modal. */}
        <div className="p-6 space-y-8">
          <section className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-12">
                Step 1: Add the script
              </h3>
              <p className="text-sm text-gray-11 mt-1">
                Add this script tag just before the closing{" "}
                <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono">
                  {"</body>"}
                </code>{" "}
                tag on your page.
              </p>
            </div>
            <div className="rounded text-sm border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-3 border-b">
                <span className="text-xs text-gray-11 font-medium">HTML</span>
                <Copier
                  text={script_snippet}
                  classes="p-1.5 rounded text-gray-11 hover:bg-secondary hover:text-gray-12"
                />
              </div>
              <HighlightedCode
                code={script_snippet}
                lang="html"
                className="[&_pre]:p-4 [&_pre]:m-0 [&_pre]:overflow-x-auto"
                fallback_class_name="p-4 m-0 overflow-x-auto text-gray-11"
              />
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-12">
                Step 2: Add the container
              </h3>
              <p className="text-sm text-gray-11 mt-1">
                Place this element where you want the donation form to appear.
              </p>
            </div>
            <div className="rounded text-sm border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-3 border-b">
                <span className="text-xs text-gray-11 font-medium">HTML</span>
                <Copier
                  text={container_snippet}
                  classes="p-1.5 rounded text-gray-11 hover:bg-secondary hover:text-gray-12"
                />
              </div>
              <HighlightedCode
                code={container_snippet}
                lang="html"
                className="[&_pre]:p-4 [&_pre]:m-0 [&_pre]:overflow-x-auto"
                fallback_class_name="p-4 m-0 overflow-x-auto text-gray-11"
              />
            </div>
          </section>
        </div>
      </Modal>
    </>
  );
}

export function ScriptSetupBanner() {
  const { mode } = useEmbedMode();
  const params = useParams();
  const id = params.id as string;

  if (mode !== "script") return null;

  return (
    <div className="flex items-start gap-2 p-3 bg-warning-subtle rounded text-sm">
      <Info size={16} className="text-warning-subtle-fg shrink-0 mt-0.5" />
      <span className="text-warning-subtle-fg">
        This snippet requires additional setup. <SetupModal id={id} />
      </span>
    </div>
  );
}

export type { EmbedMode };
