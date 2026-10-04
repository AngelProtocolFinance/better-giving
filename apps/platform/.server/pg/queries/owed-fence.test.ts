import { describe, expect, test } from "vitest";
import { type Source, sources_of } from "#/__tests__/conformance/walk";

// the owed ledger is written only through queries/owed.ts's verbs, each by its
// owner. matched as words, not import statements, so a namespace import
// (`o.credit_owed`), an alias, the schema barrel and raw sql are all seen
const platform = "apps/platform";
const in_refund_core = (file: string) =>
  file.startsWith(`${platform}/.server/refund/`);
const OWNER: Record<string, (file: string) => boolean> = {
  record_owed: in_refund_core,
  credit_owed: in_refund_core,
  credit_back: in_refund_core,
  recover_owed: (file) => file === `${platform}/.server/payouts/settle.ts`,
};
const LEDGER_HOME = [
  `${platform}/.server/pg/queries/owed.ts`,
  `${platform}/.server/pg/schema/owed.ts`,
];
const TABLE = /\b(owed_amounts|owed_entries)\b/g;
const VERB = new RegExp(`\\b(${Object.keys(OWNER).join("|")})\\b`, "g");

const uncommented = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(?<![:"'\\])\/\/.*$/gm, "");

/** `file: name` for each reach around the ledger's verbs or past their owners */
function offenders(sources: Source[]): string[] {
  return sources
    .filter(({ file }) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .filter(({ file }) => !LEDGER_HOME.includes(file))
    .flatMap(({ file, text }) => [
      ...[...text.matchAll(TABLE)].map(([name]) => `${file}: ${name}`),
      ...[...text.matchAll(VERB)]
        .filter(([name]) => !OWNER[name]!(file))
        .map(([name]) => `${file}: ${name}`),
    ]);
}

describe("owed ledger fence", () => {
  test("nothing reaches the ledger's tables or verbs outside their owners", () => {
    const sources = sources_of(import.meta.url, uncommented, [
      `${platform}/src`,
      `${platform}/lib`,
      `${platform}/jobs`,
      `${platform}/.server`,
    ]);
    expect(offenders(sources)).toEqual([]);
  });

  test("the sweep flags a namespace import, a barrel table and a verb off its owner", () => {
    const at = (file: string, text: string): Source => ({
      file: `${platform}/${file}`,
      text: uncommented(text),
    });

    expect(
      offenders([
        at(
          "src/routes/x/api.ts",
          `import * as o from "~/.server/pg/queries/owed";\nawait o.credit_owed(db, c);`
        ),
        at(
          ".server/jobs/y.ts",
          `import { owed_amounts } from "../pg/schema";\nawait tx.update(owed_amounts);`
        ),
        at(".server/refund/z.ts", `await recover_owed(tx, r);`),
        at(".server/refund/ok.ts", `await credit_owed(tx, c); // owed_amounts`),
      ])
    ).toEqual([
      `${platform}/src/routes/x/api.ts: credit_owed`,
      `${platform}/.server/jobs/y.ts: owed_amounts`,
      `${platform}/.server/jobs/y.ts: owed_amounts`,
      `${platform}/.server/refund/z.ts: recover_owed`,
    ]);
  });
});
