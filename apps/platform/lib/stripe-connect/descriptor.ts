// stripe's rules for a card charge's descriptor
// (docs.stripe.com/get-started/account/statement-descriptors.md, read
// 2026-10-13): latin only, none of < > \ ' " *, prefix + "* " + suffix 5 to 22
// chars, and a letter in each part. no suffix minimum beyond that letter: the
// 2-char floor on a prefix already makes 5
const MAX_DESCRIPTOR = 22;
const SEPARATOR = "* ";

// latin capitals NFD leaves whole (ß has already become SS by uppercasing)
const UNDECOMPOSED: Record<string, string> = {
  Æ: "AE",
  Œ: "OE",
  Ø: "O",
  Ł: "L",
  Đ: "D",
  Ð: "D",
  Þ: "TH",
};

const latin_upper = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[ÆŒØŁĐÐÞ]/g, (c) => UNDECOMPOSED[c]!)
    .replace(/[<>\\'"*]/g, "")
    // any other script is a word gap, not glue between neighbours
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * the `statement_descriptor_suffix` showing `name` beside `prefix`, or
 * undefined when nothing printable is left — set no suffix then
 * @param prefix - the account's shortened descriptor
 */
export const descriptor_suffix = (
  name: string,
  prefix: string
): string | undefined => {
  // clamped: a negative end would make slice keep all but the tail
  const room = Math.max(0, MAX_DESCRIPTOR - prefix.length - SEPARATOR.length);
  const suffix = latin_upper(name).slice(0, room).trim();
  return /[A-Z]/.test(suffix) ? suffix : undefined;
};
