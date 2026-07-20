import { useEffect, useState } from "react";
import { type BundledLanguage, codeToHtml, type ShikiTransformer } from "shiki";

interface UseHighlightedArgs {
  code: string;
  lang?: BundledLanguage;
  theme?: string;
  // optional shiki transformers, e.g. line-highlighting. the forms playground
  // pages pass a highlight-line transformer so the changed lines glow.
  transformers?: ShikiTransformer[];
}

// shared shiki bridge. bg-docs re-implemented "highlight this snippet then
// dangerouslySetInnerHTML it, with a plain-text fallback" on every page — this
// consolidates it. highlighting runs client-side in an effect (shiki's wasm is
// heavy + ssr-unsafe here); until it resolves the caller renders a plain <pre>
// fallback, so ssr + no-js still shows the code, just unstyled.
export function use_highlighted({
  code,
  lang = "html",
  theme = "github-light",
  transformers,
}: UseHighlightedArgs): string {
  const [html, set_html] = useState("");

  useEffect(() => {
    let alive = true;
    codeToHtml(code, { lang, theme, transformers }).then((out) => {
      if (alive) set_html(out);
    });
    return () => {
      alive = false;
    };
  }, [code, lang, theme, transformers]);

  return html;
}

interface HighlightedCodeProps {
  code: string;
  lang?: BundledLanguage;
  theme?: string;
  transformers?: ShikiTransformer[];
  className?: string;
  // classes for the plain-text <pre> fallback shown before shiki resolves.
  fallback_class_name?: string;
}

// renders a highlighted snippet, falling back to a plain <pre> until shiki
// resolves (also the ssr / no-js render). the `[&_pre]:…` overrides bg-docs put
// on the wrapper stay the caller's concern — pass them via `className`.
export function HighlightedCode({
  code,
  lang,
  theme,
  transformers,
  className,
  fallback_class_name,
}: HighlightedCodeProps) {
  const html = use_highlighted({ code, lang, theme, transformers });

  if (!html) {
    return (
      <pre className={fallback_class_name ?? "p-4 m-0 overflow-x-auto"}>
        {code}
      </pre>
    );
  }

  return (
    <div
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output of a static, in-repo code string
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
