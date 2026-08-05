// employer name normalization — a reporting helper.
//
// nothing resolves this against a table: no surface asserts that a named
// employer runs a matching programme, so there is no lookup to key. what the
// normalizer buys is grouping — the demand report counts employers our donors
// actually work for, and without it "Apple", "Apple Inc." and "apple computer"
// are three rows instead of one.
//
// call sites also use a "" return as the "no employer given" test, so keep it
// total: any input is acceptable, none of it throws.

// trailing legal-entity markers. stripped repeatedly from the end, so
// "Foo Holdings Inc" and "Foo" collapse to the same key.
const LEGAL_SUFFIXES = new Set([
  "incorporated",
  "corporation",
  "limited",
  "company",
  "holdings",
  "holding",
  "group",
  "inc",
  "corp",
  "co",
  "llc",
  "lllp",
  "llp",
  "lp",
  "pllc",
  "plc",
  "pc",
  "ltd",
  "ltda",
  "gmbh",
  "mbh",
  "ag",
  "nv",
  "bv",
  "sa",
  "sas",
  "sarl",
  "srl",
  "spa",
  "oy",
  "oyj",
  "ab",
  "as",
  "asa",
  "aps",
  "pty",
  "pte",
  "kk",
  "kg",
  "ohg",
  "fzc",
  "fze",
  "dmcc",
]);

/**
 * canonical grouping key for an employer name.
 *
 * lowercases, strips diacritics and punctuation, expands `&`, drops a leading
 * "the", then repeatedly strips trailing legal-entity markers.
 *
 * returns "" for input that normalizes away entirely — callers treat that as
 * "no employer given".
 */
export function normalize_employer(raw: string): string {
  const s = raw
    .normalize("NFKD")
    // combining marks left behind by NFKD — "é" is now "e" + U+0301.
    // not after a cyrillic base: there the mark is part of the letter, not an
    // accent on it, so stripping it merges distinct alphabet letters — "й"
    // would become "и" and two unrelated employers would collapse into one
    // row of the demand report.
    .replace(/(?<!\p{sc=Cyrillic})[̀-ͯ]/gu, "")
    .toLowerCase()
    // periods first, so "l.l.c." collapses to "llc" instead of "l l c"
    .replace(/\./g, "")
    .replace(/&/g, " and ")
    // letters, numbers and marks in any script — an ascii-only class would
    // normalize a name written entirely in e.g. japanese or cyrillic to "",
    // which reads downstream as "no employer given" rather than as a miss.
    // \p{M} keeps the marks indic/thai/arabic spelling depends on; the latin
    // diacritics were already folded away by the NFKD pass above.
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();

  let tokens = s.split(" ").filter(Boolean);
  if (tokens[0] === "the") tokens = tokens.slice(1);
  // a trailing "and" is the conjunction the "&" expansion above left behind
  // when the token following it was itself a suffix: "merck & co." becomes
  // "merck and co", the loop takes the "co", and the key would otherwise end
  // "merck and" — a separate row from the "merck" it belongs with. stripped
  // inside the same fixpoint pass so "x & co. inc." unwinds the whole tail.
  // no employer name ends in the bare conjunction, so this needs no guard.
  while (
    tokens.length > 1 &&
    (LEGAL_SUFFIXES.has(tokens[tokens.length - 1]) ||
      tokens[tokens.length - 1] === "and")
  ) {
    tokens.pop();
  }
  return tokens.join(" ");
}
