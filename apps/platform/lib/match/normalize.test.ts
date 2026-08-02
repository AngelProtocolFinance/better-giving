import { describe, expect, test } from "vitest";
import { normalize_employer } from "./normalize";

describe("normalize_employer", () => {
  test("case, whitespace and punctuation collapse", () => {
    expect(normalize_employer("  ACME   Corp.  ")).toBe("acme");
    expect(normalize_employer("Johnson & Johnson")).toBe("johnson and johnson");
    expect(normalize_employer("Procter&Gamble")).toBe("procter and gamble");
  });

  test("legal suffixes strip, including stacked ones", () => {
    expect(normalize_employer("Acme Inc")).toBe("acme");
    expect(normalize_employer("Acme, LLC")).toBe("acme");
    expect(normalize_employer("Acme Holdings Inc.")).toBe("acme");
    expect(normalize_employer("Acme Group Ltd")).toBe("acme");
  });

  test("dotted suffixes collapse instead of splitting into letters", () => {
    expect(normalize_employer("Acme L.L.C.")).toBe("acme");
    expect(normalize_employer("Acme Inc.")).toBe("acme");
  });

  test("'& Co.' lands on the same key as the bare name", () => {
    // the "&" expansion runs before suffix stripping, so taking the "co" used
    // to strand the conjunction and mint a second key for one employer
    expect(normalize_employer("Merck & Co.")).toBe("merck");
    expect(normalize_employer("Merck & Co. Inc.")).toBe("merck");
    expect(normalize_employer("Merck")).toBe("merck");
    expect(normalize_employer("Morgan Stanley & Co.")).toBe("morgan stanley");
    expect(normalize_employer("Eli Lilly & Company")).toBe("eli lilly");
    expect(normalize_employer("Levi Strauss & Co")).toBe("levi strauss");
  });

  test("an ampersand between two real words keeps both", () => {
    // only the dangling conjunction goes — "and" mid-name is part of the name
    expect(normalize_employer("Procter & Gamble Co.")).toBe(
      "procter and gamble"
    );
    expect(normalize_employer("Johnson & Johnson")).toBe("johnson and johnson");
    expect(normalize_employer("John Wiley & Sons")).toBe("john wiley and sons");
  });

  test("a leading 'the' is dropped", () => {
    expect(normalize_employer("The Boeing Company")).toBe("boeing");
    expect(normalize_employer("Boeing")).toBe("boeing");
  });

  test("diacritics fold", () => {
    expect(normalize_employer("Nestlé")).toBe("nestle");
    expect(normalize_employer("Société Générale")).toBe("societe generale");
  });

  test("a name that is nothing but a suffix keeps its last token", () => {
    // otherwise "Group" normalizes to "" and silently reads as "no employer"
    expect(normalize_employer("Group")).toBe("group");
    expect(normalize_employer("The Co")).toBe("co");
  });

  test("non-latin scripts keep a key instead of vanishing", () => {
    // an empty key reads downstream as "no employer given", so a name that is
    // entirely non-latin must still normalize to something
    expect(normalize_employer("Яндекс")).not.toBe("");
    expect(normalize_employer("トヨタ自動車")).not.toBe("");
    expect(normalize_employer("삼성전자")).not.toBe("");
    expect(normalize_employer("华为")).not.toBe("");
  });

  test("non-latin names still fold case and whitespace", () => {
    expect(normalize_employer("  ЯНДЕКС  ")).toBe(normalize_employer("Яндекс"));
    expect(normalize_employer("トヨタ、自動車")).toBe(
      normalize_employer("トヨタ 自動車")
    );
  });

  test("combining marks other scripts spell with are preserved", () => {
    // "टाटा" without its vowel signs is a different word — dropping marks
    // would collide unrelated employers onto one key
    expect(normalize_employer("टाटा")).not.toBe(normalize_employer("टट"));
  });

  test("cyrillic letters spelled with a combining mark stay distinct", () => {
    // NFKD decomposes "й" into "и" + U+0306; folding that mark away the way a
    // latin accent is folded merges two different letters, so unrelated
    // employers would share a key
    expect(normalize_employer("Йота")).not.toBe(normalize_employer("Иота"));
    expect(normalize_employer("Ёлка")).not.toBe(normalize_employer("Елка"));
    expect(normalize_employer("Ўзбек")).not.toBe(normalize_employer("Узбек"));
  });

  test("precomposed and decomposed cyrillic reach the same key", () => {
    // keeping the mark must not make the key depend on how the donor's keyboard
    // encoded the letter — the NFKD pass collapses both spellings first
    expect(normalize_employer("\u0419\u043e\u0442\u0430")).toBe(
      normalize_employer("\u0418\u0306\u043e\u0442\u0430")
    );
  });

  test("input that normalizes away entirely returns empty", () => {
    expect(normalize_employer("   ")).toBe("");
    expect(normalize_employer("!!!")).toBe("");
    expect(normalize_employer("🎉🎉")).toBe("");
  });

  test("distinct employers do not collide", () => {
    expect(normalize_employer("Acme Systems")).not.toBe(
      normalize_employer("Acme Solutions")
    );
  });
});
