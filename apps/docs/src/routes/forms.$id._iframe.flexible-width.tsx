import { ExternalLink, Info } from "lucide-react";
import { useMemo } from "react";
import { useParams } from "react-router";
import type { ShikiTransformer } from "shiki";
import { CopyButton } from "#/components/copy-button";
import {
  EmbedModeTabs,
  esc_attr,
  PlatformGuide,
  ScriptSetupBanner,
  useEmbedMode,
} from "#/components/forms";
import { HighlightedCode } from "#/components/highlighted-code";

const highlight_line = (lines: number[]): ShikiTransformer => ({
  name: "highlight-line",
  line(node, line) {
    if (lines.includes(line)) {
      node.properties.class = "bg-yellow-500/20";
    }
  },
});

function get_iframe_snippet(id: string) {
  return `<iframe
  title="donation form embed"
  src="https://better.giving/forms/${esc_attr(id)}"
  allow="payment"
  width="100%"
  height="500"
  style="max-width: 700px"
></iframe>`;
}

function get_script_snippet(id: string) {
  return `<div
  data-bg-form="${esc_attr(id)}"
  style="max-width: 700px; width: 100%"
></div>`;
}

export default function FlexibleWidth() {
  const params = useParams();
  const id = params.id as string;
  const { mode } = useEmbedMode();

  const code_snippet =
    mode === "iframe" ? get_iframe_snippet(id) : get_script_snippet(id);
  const transformers = useMemo(
    () => [highlight_line(mode === "iframe" ? [5, 7] : [3])],
    [mode]
  );

  return (
    <div className="p-4 space-y-6 w-full min-w-0 overflow-hidden">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Flexible Width</h1>
        <p className="text-sm text-neutral-600 mt-1">
          The form adapts to fill the available width of its container, making
          it responsive across different screen sizes.
        </p>
        <a
          href="/demo-nonprofit#flexible-width"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 mt-2"
        >
          <ExternalLink size={14} />
          See it in action on a demo page
        </a>
      </div>

      {/* Info Note */}
      <div className="flex gap-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
        <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="text-blue-800">
          Set <code className="bg-blue-100 px-1 rounded">width: 100%</code> and
          a <code className="bg-blue-100 px-1 rounded">max-width</code> to
          ensure the form is responsive but doesn&apos;t stretch too wide on
          large screens.
        </p>
      </div>

      <iframe
        title="donation form embed"
        src={`https://better.giving/forms/${id}`}
        allow="payment"
        width="100%"
        height="500"
        style={{ maxWidth: "700px" }}
      />

      <div className="rounded text-sm border border-neutral-200 overflow-hidden min-w-0 max-w-full">
        <div className="flex items-center justify-between px-4 py-2 bg-neutral-50 border-b border-neutral-200">
          <EmbedModeTabs />
          <CopyButton text={code_snippet} />
        </div>
        <HighlightedCode
          code={code_snippet}
          lang="html"
          transformers={transformers}
          className="[&_pre]:p-4 [&_pre]:m-0 [&_pre]:overflow-x-auto"
          fallback_class_name="p-4 m-0 overflow-x-auto text-neutral-600"
        />
      </div>

      <ScriptSetupBanner />
      <PlatformGuide />
    </div>
  );
}
