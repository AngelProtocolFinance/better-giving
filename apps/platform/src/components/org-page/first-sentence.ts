/** words whose period doesn't end a sentence: "St. Jude", "Dr. King" */
const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "st",
  "mt",
  "ft",
  "jr",
  "sr",
  "no",
  "vs",
  "inc",
  "co",
  "corp",
  "ltd",
  "dept",
  "approx",
  "est",
]);

/** the deck a layout takes from the story when there is no tagline: the first
 * paragraph up to its first sentence's closing mark, or the whole paragraph
 * when it has none. `text` is `to_text`'s, which parts blocks with a blank
 * line. a period after an abbreviation or an initial ("U.S.", "e.g.") does
 * not close the sentence */
export function first_sentence(text: string): string {
  const [first = ""] = text.trim().split(/\n\s*\n/);
  const flat = first.replace(/\s+/g, " ").trim();
  for (const m of flat.matchAll(/[.!?](?= |$)/g)) {
    const end = m.index + 1;
    if (m[0] === "." && !closes(flat.slice(0, m.index))) continue;
    return flat.slice(0, end);
  }
  return flat;
}

/** whether a period right after `before` closes a sentence */
function closes(before: string): boolean {
  const word = before.slice(before.lastIndexOf(" ") + 1);
  // an initial or a dotted run: "J", "U.S", "e.g"
  if (/^(?:\p{L}\.)*\p{L}$/u.test(word)) return false;
  return !ABBREVIATIONS.has(word.replace(/^\W+/, "").toLowerCase());
}
