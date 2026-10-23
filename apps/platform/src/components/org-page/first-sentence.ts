/** the deck a layout takes from the story when there is no tagline: the first
 * paragraph up to its first sentence's closing mark, or the whole paragraph
 * when it has none. `text` is `to_text`'s, which parts blocks with a blank
 * line */
export function first_sentence(text: string): string {
  const [first = ""] = text.trim().split(/\n\s*\n/);
  const flat = first.replace(/\s+/g, " ").trim();
  return flat.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? flat;
}
