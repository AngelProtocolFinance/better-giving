import { beforeEach, describe, expect, test, vi } from "vitest";

const capture_exception = vi.fn();
vi.mock("@sentry/react-router", () => ({
  captureException: (...args: unknown[]) => capture_exception(...args),
}));

const { report_unhandled } = await import("./report");

// the level IS the contract: `level:error` is meant to read as a list of our
// own bugs, so anything a third party throws that leaves the ui working has to
// land on warning instead
const level = () => capture_exception.mock.calls.at(-1)?.[1]?.level;

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
  });

  // both halves of the match are required — the name on its own is a generic
  // dom error, and keying on it would bury real defects
  test("still reports another InvalidAccessError as an error", () => {
    report_unhandled({ name: "InvalidAccessError", message: "detached node" });
    expect(level()).toBe("error");
  });

  test("still reports the apple pay message under another name", () => {
    report_unhandled({ name: "TypeError", message: insecure_parent.message });
    expect(level()).toBe("error");
  });

  test("reports an ordinary rejection as an error", () => {
    report_unhandled(new Error("boom"));
    expect(level()).toBe("error");
  });

  // the sink takes whatever a rejected promise carried, which need not be an
  // object at all
  test("survives a primitive reason", () => {
    report_unhandled("boom");
    expect(level()).toBe("error");
    report_unhandled(undefined);
    expect(level()).toBe("error");
  });
});
