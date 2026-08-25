import { Copier } from "@better-giving/ui";
import { ExternalLink, Info } from "lucide-react";
import { Resizable } from "re-resizable";
import { useCallback, useMemo, useState } from "react";
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

export default function CustomDimensions() {
  const params = useParams();
  const id = params.id as string;
  const { mode } = useEmbedMode();
  const [size, set_size] = useState({ width: 700, height: 500 });

  const get_iframe_snippet = useCallback(
    (width: number, height: number) => `<iframe
  title="donation form embed"
  src="https://better.giving/forms/${esc_attr(id)}"
  allow="payment"
  width="${width}"
  height="${height}"
></iframe>`,
    [id]
  );

  const get_script_snippet = useCallback(
    (width: number, height: number) => `<div
  data-bg-form="${esc_attr(id)}"
  style="width: ${width}px; height: ${height}px; overflow: auto"
></div>`,
    [id]
  );

  const get_code_snippet = useCallback(
    (width: number, height: number) =>
      mode === "iframe"
        ? get_iframe_snippet(width, height)
        : get_script_snippet(width, height),
    [mode, get_iframe_snippet, get_script_snippet]
  );

  const code_snippet = get_code_snippet(size.width, size.height);
  const transformers = useMemo(
    () => [highlight_line(mode === "iframe" ? [5, 6] : [3])],
    [mode]
  );

  return (
    <div className="p-4 space-y-6 min-w-0 overflow-hidden">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-12">Custom Dimensions</h1>
        <p className="text-sm text-gray-11 mt-1">
          Easily change the width and height of your embedded donation form.
        </p>
        <a
          href="/demo-nonprofit#fixed-dimensions"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-deep mt-2"
        >
          <ExternalLink size={14} />
          See it in action on a demo page
        </a>
      </div>

      {/* Note */}
      <div className="flex gap-3 p-3 bg-secondary rounded text-sm">
        <Info size={18} className="text-primary shrink-0 mt-0.5" />
        <p className="text-gray-12">
          The donation form content reorganizes on smaller set width and scrolls
          if it exceeds the set height.
        </p>
      </div>

      <Resizable
        size={size}
        minWidth={300}
        minHeight={200}
        onResizeStop={(_, __, ref) => {
          set_size({
            width: ref.offsetWidth,
            height: ref.offsetHeight,
          });
        }}
        handleStyles={{
          bottomRight: {
            width: 16,
            height: 16,
            bottom: 0,
            right: 0,
            cursor: "se-resize",
          },
        }}
        handleComponent={{
          bottomRight: (
            <div className="w-4 h-4 bg-primary hover:bg-primary-deep rounded" />
          ),
        }}
        enable={{ bottomRight: true }}
      >
        <iframe
          title="donation form embed"
          src={`https://better.giving/forms/${id}`}
          allow="payment"
          width="100%"
          height="100%"
          style={{ border: "1px solid lightgray" }}
        />
      </Resizable>

      <div className="text-sm text-gray-11">
        {size.width} x {size.height}
      </div>

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
