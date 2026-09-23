import { beforeEach, describe, expect, test, vi } from "vitest";

const capture_exception = vi.fn();
vi.mock("@sentry/react-router", () => ({
  captureException: (...args: unknown[]) => capture_exception(...args),
}));

const { report_error, report_unhandled } = await import("./report");
const { HttpError } = await import("@/helpers/https");
const { DrizzleQueryError } = await import("drizzle-orm/errors");
let console_error: ReturnType<typeof vi.spyOn>;

// the `report` tag IS the contract: `report:bug` is meant to read as a list of
// our own bugs, so anything a third party throws that leaves the ui working has
// to land on `degraded` instead. level carries the same split for the event
// page, but only the tag is searchable, so both are asserted together.
const level = () => capture_exception.mock.calls.at(-1)?.[1]?.level;
const report = () => capture_exception.mock.calls.at(-1)?.[1]?.tags?.report;

// what safari actually throws — read as a plain object because the real one
// crosses the embedder's realm
const insecure_parent = {
  name: "InvalidAccessError",
  message:
    "Trying to start an Apple Pay session from a document with an insecure parent frame.",
};

describe("report_unhandled", () => {
  beforeEach(() => {
    capture_exception.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  test("degrades safari's insecure-parent apple pay rejection", () => {
    report_unhandled(insecure_parent);
    expect(level()).toBe("warning");
    expect(report()).toBe("degraded");
  });

  // both halves of the match are required — the name on its own is a generic
  // dom error, and keying on it would bury real defects
  test("still reports another InvalidAccessError as an error", () => {
    report_unhandled({ name: "InvalidAccessError", message: "detached node" });
    expect(level()).toBe("error");
    expect(report()).toBe("bug");
  });

  test("still reports the apple pay message under another name", () => {
    report_unhandled({ name: "TypeError", message: insecure_parent.message });
    expect(level()).toBe("error");
    expect(report()).toBe("bug");
  });

  test("reports an ordinary rejection as an error", () => {
    report_unhandled(new Error("boom"));
    expect(level()).toBe("error");
    expect(report()).toBe("bug");
  });

  // the sink takes whatever a rejected promise carried, which need not be an
  // object at all
  test("survives a primitive reason", () => {
    report_unhandled("boom");
    expect(level()).toBe("error");
    expect(report()).toBe("bug");
    report_unhandled(undefined);
    expect(level()).toBe("error");
    expect(report()).toBe("bug");
  });
});

describe("report_error", () => {
  beforeEach(() => {
    capture_exception.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // a refusal the donor reads and acts on is not a defect
  test("keeps a 4xx HttpError off sentry", () => {
    report_error(new HttpError(400, "The minimum donation is $2."));
    expect(capture_exception).not.toHaveBeenCalled();
  });

  test("reports a 5xx HttpError", () => {
    report_error(new HttpError(500, ""));
    expect(capture_exception).toHaveBeenCalledOnce();
  });
});

// drizzle's DrizzleQueryError message ends in `params: …` — the bound values,
// here a donor's email — and postgres' own `detail` echoes them again
describe("report_error with a failed query", () => {
  const email = "donor@example.com";
  const query = 'update "donations" set "email" = $1 where "id" = $2';
  const failed_query = () => {
    const pg = Object.assign(
      new Error(`duplicate key value violates unique constraint "don_email"`),
      {
        code: "23505",
        constraint: "don_email",
        table: "donations",
        detail: `Key (email)=(${email}) already exists.`,
      }
    );
    return new DrizzleQueryError(query, [email, "don-1"], pg);
  };
  const logged = () =>
    JSON.stringify(
      [console_error.mock.calls, capture_exception.mock.calls],
      (_, v) =>
        v instanceof Error
          ? { ...v, message: v.message, stack: v.stack, cause: v.cause }
          : v
    );

  beforeEach(() => {
    capture_exception.mockClear();
    console_error = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  test("keeps bound values out of the log and sentry", () => {
    report_error(failed_query());
    expect(capture_exception).toHaveBeenCalledOnce();
    expect(logged()).not.toContain(email);
    const sent = capture_exception.mock.calls[0]![0] as Error & {
      code: unknown;
      constraint: unknown;
    };
    expect(sent.message).toContain(query);
    expect(sent.code).toBe("23505");
    expect(sent.constraint).toBe("don_email");
  });

  test("scrubs a failed query wrapped as another error's cause", () => {
    report_error(new Error("settle failed", { cause: failed_query() }));
    expect(capture_exception).toHaveBeenCalledOnce();
    expect(logged()).not.toContain(email);
    const sent = capture_exception.mock.calls[0]![0] as Error;
    expect(sent.message).toBe("settle failed");
    const cause = sent.cause as Error & { code: unknown };
    expect(cause.message).toContain(query);
    expect(cause.code).toBe("23505");
  });

  test("reports any other error as thrown", () => {
    const err = new Error("boom", { cause: new Error("inner") });
    report_error(err);
    expect(console_error.mock.calls[0]![0]).toBe(err);
    expect(capture_exception.mock.calls[0]![0]).toBe(err);
  });
});
