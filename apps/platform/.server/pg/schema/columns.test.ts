import { PGlite } from "@electric-sql/pglite";
import { pgTable, text } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  onTestFinished,
  test,
} from "vitest";
import { timestamp_as_iso } from "./columns";

const stamps = pgTable("stamps", {
  id: text("id").primaryKey(),
  tz: timestamp_as_iso("tz", { withTimezone: true }),
  bare: timestamp_as_iso("bare"),
});

let client: PGlite;
let db: ReturnType<typeof drizzle>;

beforeEach(async () => {
  client = new PGlite();
  await client.exec(
    "create table stamps (id text primary key, tz timestamptz, bare timestamp)"
  );
  db = drizzle(client);
});

afterEach(async () => {
  await client.close();
});

describe("timestamp_as_iso", () => {
  test("reads a timestamptz back as ISO-8601 UTC", async () => {
    await client.exec(
      "insert into stamps (id, tz) values ('a', '2027-09-23 12:55:37+00')"
    );
    const [row] = await db.select().from(stamps);
    expect(row.tz).toBe("2027-09-23T12:55:37.000Z");
  });

  test("reads a timestamptz as the same instant under a non-UTC session zone", async () => {
    await client.exec(`
      set time zone 'Asia/Kolkata';
      insert into stamps (id, tz) values ('a', '2027-09-23 12:55:37.123456+00');
    `);
    const [row] = await db.select().from(stamps);
    expect(row.tz).toBe("2027-09-23T12:55:37.123456Z");
  });

  test("keeps the microseconds postgres stores", async () => {
    await client.exec(
      "insert into stamps (id, tz) values ('a', '2027-09-23 12:55:37.123456+00')"
    );
    const [row] = await db.select().from(stamps);
    expect(row.tz).toBe("2027-09-23T12:55:37.123456Z");
  });

  test("pads a short fraction to milliseconds", async () => {
    await client.exec(
      "insert into stamps (id, tz) values ('a', '2027-09-23 12:55:37.12+00')"
    );
    const [row] = await db.select().from(stamps);
    expect(row.tz).toBe("2027-09-23T12:55:37.120Z");
  });

  test("reads a timestamp without time zone as UTC", async () => {
    // a host already on UTC would hide a local-time parse
    const host_tz = process.env.TZ;
    process.env.TZ = "America/New_York";
    onTestFinished(() => {
      if (host_tz === undefined) delete process.env.TZ;
      else process.env.TZ = host_tz;
    });
    await client.exec(
      "insert into stamps (id, bare) values ('a', '2027-09-23 12:55:37')"
    );
    const [row] = await db.select().from(stamps);
    expect(row.bare).toBe("2027-09-23T12:55:37.000Z");
  });
});
