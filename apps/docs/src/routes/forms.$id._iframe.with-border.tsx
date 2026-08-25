import { Copier } from "@better-giving/ui";
import { ExternalLink, Lightbulb } from "lucide-react";
import { useMemo } from "react";
import { useParams } from "react-router";
import type { ShikiTransformer } from "shiki";
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
      node.properties.class = "bg-warning/20";
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
  style="max-width: 700px; border: 1px solid lightgray"
></iframe>`;
}

function get_script_snippet(id: string) {
  return `<div
  data-bg-form="${esc_attr(id)}"
  style="max-width: 700px; width: 100%; border: 1px solid lightgray"
></div>`;
}

export default function WithBorder() {
  const params = useParams();
  const id = params.id as string;
  const { mode } = useEmbedMode();

  const code_snippet =
    mode === "iframe" ? get_iframe_snippet(id) : get_script_snippet(id);
  const transformers = useMemo(
    () => [highlight_line(mode === "iframe" ? [7] : [3])],
    [mode]
  );

  return (
    <div className="p-4 space-y-6 w-full min-w-0 overflow-hidden">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-12">With Border</h1>
        <p className="text-sm text-gray-11 mt-1">
          Add a border to visually separate the form from surrounding content,
          especially useful when your site has a white background.
        </p>
        <a
          href="/demo-nonprofit#with-border"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-deep mt-2"
        >
          <ExternalLink size={14} />
          See it in action on a demo page
        </a>
      </div>

      {/* Tip Note */}
      <div className="flex gap-3 p-3 bg-warning-subtle rounded text-sm">
        <Lightbulb
          size={18}
          className="text-warning-subtle-fg shrink-0 mt-0.5"
        />
        <p className="text-warning-subtle-fg">
          Use a subtle border color like{" "}
          <code className="bg-panel px-1 rounded">lightgray</code> or{" "}
          <code className="bg-panel px-1 rounded">#e5e5e5</code> to blend with
          most designs without being too prominent.
        </p>
      </div>

      <iframe
        title="donation form embed"
        src={`https://better.giving/forms/${id}`}
        allow="payment"
        width="100%"
        height="500"
        style={{ border: "1px solid lightgray", maxWidth: "700px" }}
      />

      <div className="rounded text-sm border overflow-hidden min-w-0 max-w-full">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-3 border-b">
          <EmbedModeTabs />
          <Copier
            text={code_snippet}
            classes="p-1.5 rounded text-gray-11 hover:bg-secondary hover:text-gray-12"
          />
        </div>
        <HighlightedCode
          code={code_snippet}
          lang="html"
          transformers={transformers}
          className="[&_pre]:p-4 [&_pre]:m-0 [&_pre]:overflow-x-auto"
          fallback_class_name="p-4 m-0 overflow-x-auto text-gray-11"
        />
      </div>

      <ScriptSetupBanner />
      <PlatformGuide />
    </div>
  );
}
