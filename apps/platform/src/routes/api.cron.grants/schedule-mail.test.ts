import { grants_schedule } from "emails";
import { beforeEach, describe, expect, test, vi } from "vitest";

// the real send path, mocked only at the transport, so the text part asserted
// is the one the provider receives
const send_mail = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => {
  const createTransport = () => ({ sendMail: send_mail });
  return { default: { createTransport }, createTransport };
});
vi.mock("$/env", () => ({ smtp: { password: "test-token" }, stage: "test" }));
vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));

const { send_email } = await import("$/email");

const sent_text = async (data: grants_schedule.IData) => {
  await send_email({ ...grants_schedule.template(data), to: ["ops@test.com"] });
  const [mail] = send_mail.mock.calls[0]!;
  return mail.text as string;
};

/** the text line beginning with `first`, split on the column gutter */
const row_cells = (text: string, first: string) =>
  text
    .split("\n")
    .find((l) => l.trimStart().startsWith(`${first} `))
    ?.trim()
    .split(/\s{2,}/);

beforeEach(() => {
  send_mail.mockReset();
  send_mail.mockResolvedValue({ messageId: "<m@bg>", response: "250 ok" });
});

describe("grants schedule text part", () => {
  test("each grant is its own line with its cells apart", async () => {
    const text = await sent_text({
      rows: [
        {
          id: 12,
          name: "Save The Rainforest",
          amount: 1234.567,
          min: 50,
          effect: "pass",
        },
        { id: 7, name: "River Trust", amount: 20, min: 50, effect: "skipped" },
      ],
      total_grant: 1234.567,
      wise_usd_balance: 5000,
      report_period: "2610",
      low_balance: false,
    });

    expect(row_cells(text, "12")).toEqual([
      "12",
      "Save The Rainforest",
      "$1,234.567",
      "$50",
      "pass",
    ]);
    expect(row_cells(text, "7")).toEqual([
      "7",
      "River Trust",
      "$20",
      "$50",
      "skipped",
    ]);
  });

  test("a run netting what npos owe shows each one's gross, owed and net, and each deduction by gift", async () => {
    const text = await sent_text({
      rows: [
        {
          id: 12,
          name: "Save The Rainforest",
          amount: 500,
          min: 50,
          effect: "pass",
          net: 406.8,
          deductions: [{ donation_id: "don-owed", usd: 93.2 }],
        },
        {
          id: 7,
          name: "River Trust",
          amount: 300,
          min: 50,
          effect: "pass",
          net: 350,
          deductions: [{ donation_id: "don-credited", usd: -50 }],
        },
      ],
      total_grant: 756.8,
      wise_usd_balance: 5000,
      report_period: "2610",
      low_balance: false,
    });

    expect(row_cells(text, "12")).toEqual([
      "12",
      "Save The Rainforest",
      "$500",
      "-$93.2",
      "$406.8",
      "$50",
      "pass",
    ]);
    expect(row_cells(text, "don-owed")).toEqual(["don-owed", "12", "-$93.2"]);
    expect(row_cells(text, "don-credited")).toEqual([
      "don-credited",
      "7",
      "+$50",
    ]);
  });
});
