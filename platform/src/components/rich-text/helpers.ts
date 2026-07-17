import type { PortableTextBlock } from "@portabletext/editor";
import { toPlainText } from "@portabletext/toolkit";
import type { RichTextContent } from "#/types/components";

const EMPTY_DOC: PortableTextBlock[] = [];

/** parse stored json → portable text blocks */
export function to_document(json: string | undefined): PortableTextBlock[] {
  if (!json) return EMPTY_DOC;
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (b) => b && typeof b === "object" && (b as any)._type === "block"
      )
    ) {
      return parsed as PortableTextBlock[];
    }
    return EMPTY_DOC;
  } catch {
    return EMPTY_DOC;
  }
}

export function to_content(json: string | undefined): RichTextContent {
  return {
    length: to_text(json).length,
    value: json || "",
  };
}

/** extract plain text from PT json */
export function to_text(json: string | undefined): string {
  const doc = to_document(json);
  return toPlainText(doc);
}
