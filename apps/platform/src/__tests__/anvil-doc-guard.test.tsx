import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks (hoisted) ---

const session = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
}));

const w_form_owner = vi.hoisted(() => ({
  row: null as { email: string } | null,
}));

const download = vi.hoisted(() => vi.fn());

const user_by_w_form = vi.hoisted(() => vi.fn());

const is_fsa_doc_eid = vi.hoisted(() => vi.fn());

vi.mock("#/.server/auth", () => ({
  get_session: vi.fn(async () => ({ user: session.user ?? undefined })),
}));

vi.mock("$/pg/queries/user", () => ({ user_by_w_form }));

vi.mock("$/pg/queries/registration", () => ({ is_fsa_doc_eid }));

vi.mock("$/kit/anvil", () => ({ anvil: { downloadDocuments: download } }));

// --- imports (after mocks hoisted) ---

import { loader } from "#/routes/api.anvil-doc.$eid/route";

const OWNER = { id: "user-1", email: "one@example.com" };
const OTHER = { id: "user-2", email: "two@example.com" };

const EID = "eid-w9";
const FSA = "eid-fsa";

beforeEach(() => {
  session.user = null;
  w_form_owner.row = null;
  download.mockReset();
  download.mockResolvedValue({ data: "zip-bytes", statusCode: 200 });
  user_by_w_form.mockReset();
  user_by_w_form.mockImplementation(async () => w_form_owner.row ?? undefined);
  is_fsa_doc_eid.mockReset();
  is_fsa_doc_eid.mockImplementation(async (eid: string) => eid === FSA);
});

afterEach(() => {
  vi.clearAllMocks();
});

const call = (eid?: string) =>
  (loader as any)({
    request: new Request(`https://app.test/api/anvil-doc/${eid}`),
    params: { eid },
    context: {},
  }) as Promise<Response>;

describe("anvil doc download", () => {
  it("refuses a w-9 eid with no session", async () => {
    w_form_owner.row = { email: OWNER.email };

    const res = await call(EID);

    expect(res.status).toBe(403);
    // the zip carries a taxpayer id — it must not leave the server at all
    expect(download).not.toHaveBeenCalled();
  });

  it("refuses a w-9 eid requested by a different signed-in user", async () => {
    w_form_owner.row = { email: OWNER.email };
    session.user = { ...OTHER };

    const res = await call(EID);

    expect(res.status).toBe(403);
    expect(download).not.toHaveBeenCalled();
  });

  it("serves a w-9 to the user whose row holds the eid", async () => {
    w_form_owner.row = { email: OWNER.email };
    session.user = { ...OWNER };

    const res = await call(EID);

    expect(res.status).toBe(200);
    expect(user_by_w_form).toHaveBeenCalledWith(EID);
    expect(download).toHaveBeenCalledWith(EID, { dataType: "stream" });
    expect(await res.text()).toBe("zip-bytes");
    // the zip carries a taxpayer id: no shared cache, no disk cache, and the
    // answer varies by who is asking
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("vary")).toBe("cookie");
  });

  it("serves a recorded agreement with no session", async () => {
    // the fund services agreement: its link is emailed to a registrant who
    // has no session and may be on another device
    const res = await call(FSA);

    expect(res.status).toBe(200);
    expect(is_fsa_doc_eid).toHaveBeenCalledWith(FSA);
    // recognising the agreement ends the question — the w-9 lookup is the
    // fallback, not a second opinion
    expect(user_by_w_form).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledWith(FSA, { dataType: "stream" });
    // one set of headers for both document kinds — no branch to get wrong
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("vary")).toBe("cookie");
  });

  it("refuses an eid no record claims", async () => {
    // an orphaned w-9 — the signer has since signed another, so `w_form` has
    // moved on and nothing names this document. served on a miss it would be
    // a taxpayer id handed to whoever held the eid.
    const res = await call("eid-orphan");

    expect(res.status).toBe(403);
    expect(download).not.toHaveBeenCalled();
  });

  it("refuses an eid no record claims even for a signed-in user", async () => {
    session.user = { ...OTHER };

    const res = await call("eid-orphan");

    expect(res.status).toBe(403);
    expect(download).not.toHaveBeenCalled();
  });

  it("passes anvil's status through when the download fails", async () => {
    download.mockResolvedValue({ data: "no such document", statusCode: 404 });

    const res = await call(FSA);

    expect(res.status).toBe(404);
  });

  it("never reaches anvil without an eid", async () => {
    const res = await call(undefined);

    expect(res.status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });
});
