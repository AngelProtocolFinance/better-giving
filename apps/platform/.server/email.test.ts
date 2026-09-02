import { beforeEach, describe, expect, test, vi } from "vitest";

// --- mocks (hoisted) ---

// the provider seam. mocked at the transport rather than at the module so the
// two exports below are the real ones — which of them throws is the question.
const send_mail = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => {
  const createTransport = () => ({ sendMail: send_mail });
  // nodemailer is cjs and the module reaches it through a default import;
  // which spelling survives interop depends on the transform, so both are here
  return { default: { createTransport }, createTransport };
});

vi.mock("./env", () => ({
  smtp: { password: "test-token" },
  stage: "test",
}));

vi.mock("react-email", () => ({ render: async () => "<p>hi</p>" }));

const report_error = vi.hoisted(() => vi.fn());
vi.mock("@/errors/report", () => ({ report_error }));

// --- imports (after mocks) ---

import { send_email, send_email_or_throw } from "./email";

// --- setup ---

const input = () => ({
  node: null as any,
  to: ["donor@test.com"],
  subject: "Your donation receipt",
});

beforeEach(() => {
  vi.clearAllMocks();
  send_mail.mockResolvedValue({ messageId: "<m-1@bg>", response: "250 ok" });
});

describe("send_email", () => {
  test("a refusal is reported rather than left in a log nobody reads", async () => {
    send_mail.mockRejectedValueOnce(new Error("535 Authentication Failed"));

    const res = await send_email(input());

    expect(res.data).toBeNull();
    expect(report_error).toHaveBeenCalledOnce();
  });

  test("the report carries the subject and no recipient", async () => {
    send_mail.mockRejectedValueOnce(new Error("535 Authentication Failed"));

    await send_email(input());

    // an error report is a third place a donor's address would live
    const [, ctx] = report_error.mock.calls[0]!;
    expect(ctx).toEqual({ subject: "Your donation receipt" });
  });

  test("a refusal stays non-fatal for the flows that opted into that", async () => {
    send_mail.mockRejectedValueOnce(new Error("535 Authentication Failed"));

    await expect(send_email(input())).resolves.toMatchObject({ data: null });
  });
});

describe("send_email_or_throw", () => {
  test("a refusal throws so the queue's retry can see it", async () => {
    send_mail.mockRejectedValueOnce(new Error("535 Authentication Failed"));

    await expect(send_email_or_throw(input())).rejects.toThrow(
      "535 Authentication Failed"
    );
  });

  test("a send that went out returns the provider's record of it", async () => {
    const info = await send_email_or_throw(input());

    expect(info.id).toBe("<m-1@bg>");
  });
});
