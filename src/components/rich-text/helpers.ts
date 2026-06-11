import type { Descendant, Node } from "slate";
import type { RichTextContent } from "#/types/components";
import "./slate-types";

const EMPTY_DOC: Descendant[] = [
  { type: "paragraph", children: [{ text: "" }] },
];

/** parse stored json → Slate document */
export function to_document(json: string): Descendant[] {
  if (!json) return EMPTY_DOC;
  try {
    const parsed: unknown = JSON.parse(json);
    // slate json: array of elements with `type` and `children`
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      typeof parsed[0].type === "string" &&
      Array.isArray(parsed[0].children)
    ) {
      return parsed as Descendant[];
    }
    // delta json ({ops:[...]} or [{insert:...}]) or other — treat as plain text
    // the backfill script handles proper delta→slate conversion
    return [{ type: "paragraph", children: [{ text: json }] }];
  } catch {
    // plain string fallback
    return [{ type: "paragraph", children: [{ text: json }] }];
  }
}

export function to_content(json: string | undefined): RichTextContent {
  const text = slate_to_text(json);
  return {
    length: text.length,
    value: json || "",
  };
}

/** extract plain text from Slate JSON */
export function to_text(json: string | undefined): string {
  return slate_to_text(json);
}

function slate_to_text(json: string | undefined): string {
  if (!json) return "";
  const doc = to_document(json);
  return doc.map(extract_text).join("\n").trim();
}

function extract_text(node: Node): string {
  if ("text" in node) return node.text;
  if ("children" in node) {
    return (node.children as Node[]).map(extract_text).join("");
  }
  return "";
}
