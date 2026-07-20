import { ExternalLink, Info } from "lucide-react";
import { Resizable } from "re-resizable";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router";
import type { ShikiTransformer } from "shiki";
import { CopyButton } from "#/components/copy-button";
import {
  EmbedModeTabs,
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

export default function CustomDimensions() {
  const params = useParams();
  const id = params.id as string;
  const { mode } = useEmbedMode();
  const [size, set_size] = useState({ width: 700, height: 500 });

  const get_iframe_snippet = useCallback(
    (width: number, height: number) => `<iframe
  title="donation form embed"
  src="https://better.giving/forms/${id}"
  allow="payment"
  width="${width}"
  height="${height}"
></iframe>`,
    [id]
  );

  const get_script_snippet = useCallback(
    (width: number, height: number) => `<div
  data-bg-form="${id}"
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
        <h1 className="text-xl font-bold text-neutral-900">
          Custom Dimensions
        </h1>
        <p className="text-sm text-neutral-600 mt-1">
          Easily change the width and height of your embedded donation form.
        </p>
        <a
          href="/demo-nonprofit#fixed-dimensions"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 mt-2"
        >
          <ExternalLink size={14} />
          See it in action on a demo page
        </a>
      </div>

      {/* Note */}
      <div className="flex gap-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
        <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="text-blue-800">
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
            <div className="w-4 h-4 bg-blue-500 hover:bg-blue-600 rounded" />
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

      <div className="text-sm text-neutral-500">
        {size.width} x {size.height}
      </div>

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
