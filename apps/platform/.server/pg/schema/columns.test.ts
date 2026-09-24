import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  onTestFinished,
  test,
} from "vitest";
import { pg_text_to_iso, timestamp_as_iso } from "./columns";

const stamps = pgTable("stamps", {
  id: text("id").primaryKey(),
  tz: timestamp_as_iso("tz", { withTimezone: true }),
  bare: timestamp_as_iso("bare"),
});

let client: PGlite;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = new PGlite();
  await client.exec(
    "create table stamps (id text primary key, tz timestamptz, bare timestamp)"
  );
  db = drizzle(client);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await client.exec("set time zone 'UTC'; truncate stamps");
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

  test("reads a negative whole-hour session offset as the same instant", async () => {
    await client.exec(`
      set time zone 'America/Los_Angeles';
      insert into stamps (id, tz) values
        ('winter', '2027-01-15 12:00:00.1234+00'),
        ('summer', '2027-07-15 12:00:00.12345+00');
    `);
    const rows = await db.select().from(stamps).orderBy(stamps.id);
    expect(rows.map((r) => r.tz)).toEqual([
      "2027-07-15T12:00:00.12345Z",
      "2027-01-15T12:00:00.1234Z",
    ]);
  });

  test("reads a +05:45 session offset as the same instant", async () => {
    await client.exec(`
      set time zone 'Asia/Kathmandu';
      insert into stamps (id, tz) values ('a', '2027-09-23 12:55:37+00');
    `);
    const [row] = await db.select().from(stamps);
    expect(row.tz).toBe("2027-09-23T12:55:37.000Z");
  });

  test("a timestamptz inside json decodes through the same normalizer", async () => {
    await client.exec(`
      set time zone 'America/Los_Angeles';
      insert into stamps (id, tz) values ('a', '2027-09-23 12:55:37.1234+00');
    `);
    const [row] = await db
      .select({ j: sql<{ tz: string }>`json_build_object('tz', ${stamps.tz})` })
      .from(stamps);
    expect(pg_text_to_iso(row.j.tz)).toBe("2027-09-23T12:55:37.1234Z");
  });

  test("a Date from the driver degrades to millisecond ISO", () => {
    const at = new Date("2027-09-23T12:55:37.123Z");
    expect(stamps.tz.mapFromDriverValue(at)).toBe("2027-09-23T12:55:37.123Z");
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
