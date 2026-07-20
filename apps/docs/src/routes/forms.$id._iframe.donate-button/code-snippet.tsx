import { useMemo } from "react";
import type { ShikiTransformer } from "shiki";
import { CopyButton } from "#/components/copy-button";
import {
  EmbedModeTabs,
  esc_attr,
  RADIUS_PRESETS,
  type RadiusPreset,
  ScriptSetupBanner,
  useEmbedMode,
} from "#/components/forms";
import { HighlightedCode } from "#/components/highlighted-code";

interface DialogConfig {
  button_bg: string;
  button_radius: RadiusPreset;
  button_width: number;
  button_height: number;
}

interface CodeSnippetProps {
  id: string;
  config: DialogConfig;
}

// marks the inclusive [start, end] line range with the `highlighted-line`
// class the wrapper styles. bg-docs used shiki `decorations` here (line ranges
// rather than single lines); a line transformer expresses the same span and
// keeps every page on the shared HighlightedCode helper.
const highlight_range = (start: number, end: number): ShikiTransformer => ({
  name: "highlight-range",
  line(node, line) {
    // shiki `line` is 1-based; the computed indices are 0-based.
    if (start !== -1 && line - 1 >= start && line - 1 <= end) {
      node.properties.class = "highlighted-line";
    }
  },
});

function generate_iframe_code(id: string, config: DialogConfig): string {
  const border_radius = RADIUS_PRESETS[config.button_radius];
  return `<button
  onclick="document.getElementById('donate-dialog').showModal()"
  style="width: ${config.button_width}px; height: ${config.button_height}px; background: ${config.button_bg}; color: white; border: 0; border-radius: ${border_radius}px; cursor: pointer; font-weight: 500"
>
  Donate
</button>

<dialog id="donate-dialog" style="padding: 0; border: 0; border-radius: 8px; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%)">
  <form method="dialog" style="display: flex; justify-content: flex-end">
    <button style="font-size: 24px; position: absolute; right: 8px; background: none; border: none; cursor: pointer">
      &times;
    </button>
  </form>
  <iframe
    title="donation form embed"
    src="https://better.giving/forms/${esc_attr(id)}"
    allow="payment"
    width="100%"
    height="500"
    style="max-width: 700px; width: 90vw"
  ></iframe>
</dialog>`;
}

function generate_script_code(id: string, config: DialogConfig): string {
  const border_radius = RADIUS_PRESETS[config.button_radius];
  return `<!-- Add script before </body> -->
<script src="https://better.giving/form-embed.js" async></script>

<button
  onclick="document.getElementById('donate-dialog').showModal()"
  style="width: ${config.button_width}px; height: ${config.button_height}px; background: ${config.button_bg}; color: white; border: 0; border-radius: ${border_radius}px; cursor: pointer; font-weight: 500"
>
  Donate
</button>

<dialog id="donate-dialog" style="padding: 0; border: 0; border-radius: 8px; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%)">
  <form method="dialog" style="display: flex; justify-content: flex-end">
    <button style="font-size: 24px; position: absolute; right: 8px; background: none; border: none; cursor: pointer">
      &times;
    </button>
  </form>
  <div
    data-bg-form="${esc_attr(id)}"
    style="max-width: 700px; width: 90vw"
  ></div>
</dialog>`;
}

export function CodeSnippet({ id, config }: CodeSnippetProps) {
  const { mode } = useEmbedMode();

  const code =
    mode === "iframe"
      ? generate_iframe_code(id, config)
      : generate_script_code(id, config);

  const transformers = useMemo(() => {
    // Find embed element lines to highlight (iframe or data-bg-form div)
    const lines = code.split("\n");
    const iframe_start = lines.findIndex((line) => line.includes("<iframe"));
    const iframe_end = lines.findIndex((line) => line.includes("</iframe>"));
    const div_start = lines.findIndex((line) => line.includes("data-bg-form"));
    const div_end = lines.findIndex(
      (line, i) => i >= div_start && line.includes("></div>")
    );

    if (iframe_start !== -1 && iframe_end !== -1) {
      return [highlight_range(iframe_start, iframe_end)];
    }
    if (div_start !== -1 && div_end !== -1) {
      return [highlight_range(div_start, div_end)];
    }
    return [];
  }, [code]);

  return (
    <div className="space-y-4">
      <div className="rounded text-sm border border-neutral-200 overflow-hidden min-w-0 max-w-full">
        <div className="flex items-center justify-between px-4 py-2 bg-neutral-50 border-b border-neutral-200">
          <EmbedModeTabs />
          <CopyButton text={code} />
        </div>
        <HighlightedCode
          code={code}
          lang="html"
          transformers={transformers}
          className="[&_pre]:p-4 [&_pre]:m-0 [&_pre]:overflow-x-auto [&_.highlighted-line]:bg-amber-100"
          fallback_class_name="p-4 m-0 overflow-x-auto text-neutral-600"
        />
      </div>

      <ScriptSetupBanner />
    </div>
  );
}
