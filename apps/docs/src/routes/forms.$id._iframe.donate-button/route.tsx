import { ArrowRight, Info } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { PlatformGuide } from "#/components/forms";
import { CodeSnippet } from "./code-snippet";
import { type DialogConfig, DialogDemo } from "./dialog-demo";

const DEFAULT_CONFIG: DialogConfig = {
  button_bg: "#2563eb",
  button_radius: "sm",
  button_width: 120,
  button_height: 40,
};

export default function DonateButton() {
  const params = useParams();
  const id = params.id as string;
  const [config, set_config] = useState<DialogConfig>(DEFAULT_CONFIG);

  return (
    <div className="p-4 space-y-6 min-w-0 overflow-hidden">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Donate Button</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Add a donate button that opens the form in a dialog when clicked.
        </p>
        <a
          href="/demo-nonprofit#donate-button"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 mt-2"
        >
          <ArrowRight size={14} />
          See it in action on a demo page
        </a>
      </div>

      {/* Info Note */}
      <div className="flex gap-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
        <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="text-blue-800">
          This approach is great for call-to-action buttons, headers, or
          sidebars where you want to keep the page clean while making donations
          easily accessible.
        </p>
      </div>

      <DialogDemo id={id} config={config} on_config_change={set_config} />
      <CodeSnippet id={id} config={config} />
      <PlatformGuide />
    </div>
  );
}
