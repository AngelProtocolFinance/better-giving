import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- hoisted refs ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const signer_eid = vi.hoisted(() => ({ current: "r-1" }));

// --- mocks ---

vi.mock("$/pg/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        const real = test_db.current?.db;
        if (!real) throw new Error("test_db not initialized");
        return (real as any)[prop];
      },
    }
  ),
}));

vi.mock("$/kit/queue", () => ({ enqueue: vi.fn() }));

// the real one resolves the registration id through anvil's graphql api
vi.mock("./helpers", () => ({
  signer_fn: async () => ({
    eid: signer_eid.current,
    name: "Jane Doe",
    email: "jane@test.com",
  }),
}));

// --- imports (after mocks) ---

import { eq } from "drizzle-orm";
import { registrations } from "$/pg/schema/registration";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { etch_complete } from "./etch-complete";
import type { EtchPacket } from "./types";

const BASE = "https://app.test";
const EID = "docGroupCurrent";

const payload = (doc_eid = EID) =>
  ({
    signers: [{ eid: "signerEid" }],
    documentGroup: { eid: doc_eid },
  }) as unknown as EtchPacket.Data;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(registrations);
  signer_eid.current = "r-1";
});

async function seed(cols: {
  o_fsa_doc_eid?: string;
  o_fsa_signing_url?: string;
}) {
  await test_db.current!.db.insert(registrations).values({
    id: "r-1",
    r_id: "jane@test.com",
    status: "01",
    ...cols,
  });
}

const row = async () =>
  (
    await test_db
      .current!.db.select()
      .from(registrations)
      .where(eq(registrations.id, "r-1"))
  )[0]!;

describe("etch_complete", () => {
  test("records the packet the row is waiting on", async () => {
    await seed({
      o_fsa_doc_eid: EID,
      o_fsa_signing_url: "https://anvil.test/sign",
    });

    expect(await etch_complete(payload(), BASE)).toBe(
      `${BASE}/api/anvil-doc/${EID}`
    );
    expect((await row()).o_fsa_signed_doc_url).toBe(
      `${BASE}/api/anvil-doc/${EID}`
    );
  });

  // the row moved on to a second packet while the first was still out
  test("ignores a packet the row has since replaced", async () => {
    await seed({
      o_fsa_doc_eid: "docGroupCurrent2",
      o_fsa_signing_url: "https://anvil.test/sign-2",
    });

    expect(await etch_complete(payload("docGroupStale"), BASE)).toBeUndefined();
    expect((await row()).o_fsa_signed_doc_url).toBeNull();
  });

  // the case the reset paths exist for: writing the url back would republish
  // the superseded agreement, since `is_fsa_doc_eid` matches a signed url by
  // its last path segment.
  test("ignores a packet whose agreement was invalidated", async () => {
    await seed({});

    expect(await etch_complete(payload(), BASE)).toBeUndefined();
    expect((await row()).o_fsa_signed_doc_url).toBeNull();
  });

  test("records a row that predates the eid column", async () => {
    // nothing to compare against, so the signing url stands in: the reset
    // paths clear that too.
    await seed({ o_fsa_signing_url: "https://anvil.test/sign" });

    expect(await etch_complete(payload(), BASE)).toBe(
      `${BASE}/api/anvil-doc/${EID}`
    );
    expect((await row()).o_fsa_signed_doc_url).toBe(
      `${BASE}/api/anvil-doc/${EID}`
    );
  });

  test("faults on a signer no registration claims", async () => {
    signer_eid.current = "r-unknown";
    await seed({ o_fsa_doc_eid: EID });

    await expect(etch_complete(payload(), BASE)).rejects.toThrow(/not found/);
  });
});
