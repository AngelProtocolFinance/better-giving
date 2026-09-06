import { user } from "$/pg/schema/auth";
import { fund_members, funds } from "$/pg/schema/fund";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite";

export type Db = TestDb["db"];

/** the columns every fund test's npo needs; a caller supplies its own ein/name */
const NPO_BASE = {
  registration_number: "EIN-FUND",
  name: "Fund Test NPO",
  endow_designation: "Charity",
  overview_pt: "[]",
  hq_country: "United States",
  published: false,
  active: true,
} satisfies Omit<typeof npos.$inferInsert, "id">;

export async function seed_npo(
  db: Db,
  overrides: Partial<Omit<typeof npos.$inferInsert, "id">> = {}
) {
  const [row] = await db
    .insert(npos)
    .values({ ...NPO_BASE, ...overrides })
    .returning();
  return row;
}

export async function seed_user(
  db: Db,
  email: string,
  first = "Test",
  last = "User"
) {
  const [row] = await db
    .insert(user)
    .values({
      id: crypto.randomUUID(),
      name: `${first} ${last}`,
      email,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      first_name: first,
      last_name: last,
    })
    .returning();
  return row;
}

/** `members` are npo ids joined to the fund in the order listed */
export async function seed_fund(
  db: Db,
  vals: Partial<typeof funds.$inferInsert> & {
    id: string;
    npo_owner: number | null;
    creator_id: string;
    members?: number[];
  }
) {
  const { members = [], ...rest } = vals;
  const [row] = await db
    .insert(funds)
    .values({
      name: "Test Fund",
      description_pt: "desc",
      banner: "https://img.co/banner.png",
      logo: "https://img.co/logo.png",
      active: true,
      ...rest,
    })
    .returning();
  if (members.length > 0) {
    await db
      .insert(fund_members)
      .values(
        members.map((npo_id, i) => ({ fund_id: row.id, npo_id, position: i }))
      );
  }
  return row;
}
