import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as emails from "emails";
import { render } from "react-email";
import { describe, expect, test } from "vitest";

const BASE = "https://staging.example";
const templates_dir = fileURLToPath(
  new URL("../../../../../../packages/emails/src/templates", import.meta.url)
);

const usd = (value: number) => ({ value, currency: "USD", value_usd: value });
const from = {
  first_name: "Jane",
  full_name: "Jane Doe",
  address: "1 Main St",
};
const common = {
  id: "TXN-1",
  date: "December 17, 2025",
  amount: usd(250),
  to_name: "Rainforest Fund",
  from,
  employer_name: "Northwind",
};

/** minimal valid data per template, keyed by its file name; `base_url` is added by the test */
const fixtures: Record<string, [string, any][]> = {
  "admin-endow-admin-new": [
    ["", { first_name: "John", invitor: "Jane", endow_name: "Fund" }],
  ],
  banking: (["new", "approved", "rejected", "default"] as const).map(
    (action) => [
      action,
      {
        action,
        account_summary: "Chase ending 1234",
        rejection_reason: "typo",
      },
    ]
  ),
  "donation-donor-notif": [
    [
      "",
      {
        donor_first_name: "Jane",
        transaction_id: "TXN-1",
        nonprofit_name: "Rainforest Fund",
        program_name: "Amazon",
        is_guest: true,
        is_recurring: false,
      },
    ],
  ],
  "donation-match-arrived": [
    [
      "",
      {
        donation_id: "TXN-1",
        amount: usd(250),
        to_name: common.to_name,
        from,
        employer_name: common.employer_name,
      },
    ],
  ],
  "donation-match-chase": [["", common]],
  "donation-match-filed-notif": [
    ["", { ...common, from_email: "jane@example.com" }],
  ],
  "donation-match-pack": [["", common]],
  "donation-match-refund-notif": [
    [
      "",
      {
        to_name: common.to_name,
        donor_name: "Jane Doe",
        donor_email: "jane@example.com",
        employer_name: common.employer_name,
        donation: { id: "TXN-1", amount: usd(250) },
        filed_at: "2025-12-17T10:00:00.000Z",
        refunded_at: "2025-12-21T14:30:00.000Z",
        void_reason: "refunded",
      },
    ],
  ],
  "donation-microdeposit-action": [
    [
      "",
      {
        from_name: "Jane",
        to_name: common.to_name,
        verification_link: `${BASE}/verify/abc`,
      },
    ],
  ],
  "donation-nonprofit-notif": [
    [
      "",
      {
        ...common,
        to_id: "12345",
        program_name: "Amazon",
        is_recurring: false,
        from_private_msg_to_to: "Thank you",
      },
    ],
  ],
  "donation-receipt": [
    [
      "",
      {
        ...common,
        tax_receipt_id: "TR-1",
        is_recurring: false,
        is_bg: false,
        lines: [
          {
            kind: "beneficiary",
            name: common.to_name,
            amount: usd(250),
            program: "Amazon",
          },
        ],
      },
    ],
  ],
  "registration-approved": [
    [
      "",
      {
        org_name: common.to_name,
        registrant_first_name: "Jane",
        endow_id: "12345",
      },
    ],
  ],
};

const to_export = (file: string) => file.replaceAll("-", "_");
const hrefs = (html: string) =>
  [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);

const sources = readdirSync(templates_dir)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => ({
    name: basename(f, ".tsx"),
    text: readFileSync(join(templates_dir, f), "utf8"),
  }));

describe("templates that build links on base_url", () => {
  test("every one has a fixture here", () => {
    const takes_base_url = sources
      .filter((s) => /\bbase_url\b/.test(s.text))
      .map((s) => s.name)
      .sort();

    expect(Object.keys(fixtures).sort()).toEqual(takes_base_url);
  });

  test.each(
    Object.entries(fixtures).flatMap(([name, cases]) =>
      cases.map(
        ([variant, data]) => [`${name} ${variant}`.trim(), name, data] as const
      )
    )
  )(
    "%s links to the sending environment, not production",
    async (_, name, data) => {
      const mod = (emails as Record<string, any>)[to_export(name)];
      const html = await render(mod.template({ base_url: BASE, ...data }).node);

      // host, not substring: a social handle such as instagram.com/better.giving is fine
      const production = hrefs(html).filter((h) =>
        /^(www\.)?better\.giving$/i.test(new URL(h, BASE).hostname)
      );
      expect(production).toEqual([]);
    }
  );

  test("a rendered mail carries at least one link on base_url", async () => {
    // the sweep above is vacuous if a template stops linking at all
    const html = await render(
      emails.registration_approved.template({
        base_url: BASE,
        ...fixtures["registration-approved"]![0]![1],
      }).node
    );

    expect(hrefs(html).some((h) => h.startsWith(`${BASE}/`))).toBe(true);
  });
});

describe("template sources", () => {
  test.each(sources.map((s) => [s.name, s.text] as const))(
    "%s hard-codes no better.giving link",
    (_, text) => {
      expect(text).not.toMatch(/https?:\/\/(www\.)?better\.giving/i);
    }
  );
});
