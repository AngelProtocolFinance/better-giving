#!/usr/bin/env node
// idempotent fixture: the credential member the connector-allow flow signs in
// as, and a platform admin (role `admin`) for `/platform/*` screens. launch.sh
// sets DATABASE_URL to the local verify database after seed.sql. prints
// neither the url nor the passwords.
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "../../../..");
const APP = path.join(ROOT, "apps/platform");

const MEMBER = {
  id: "verify-member",
  email: "verify-member@example.com",
  first_name: "Verify",
  last_name: "Member",
  role: "user",
  password: "Verify-member-1",
};
const ADMIN = {
  id: "verify-admin",
  email: "verify-admin@example.com",
  first_name: "Verify",
  last_name: "Admin",
  role: "admin",
  password: "Verify-admin-1",
};

process.stdout.on("error", (e) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

const safe = (message) =>
  message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://…");

const local_database = () => {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  if (!url || !["localhost", "127.0.0.1"].includes(host)) {
    console.error("seed-member: DATABASE_URL must be a local postgres");
    process.exitCode = 1;
    return null;
  }
  return url;
};

const pg = createRequire(
  path.join(ROOT, "node_modules/.pnpm/node_modules/x.js")
)("pg");
const app_req = createRequire(path.join(APP, "package.json"));
const { hashPassword, verifyPassword } = await import(
  pathToFileURL(app_req.resolve("better-auth/crypto")).href
);

const password_matches = async (hash, password) => {
  if (!hash) return false;
  try {
    return await verifyPassword({ hash, password });
  } catch {
    return false;
  }
};

/** the user row and its credential account; returns the user's id */
const upsert_user = async (client, u) => {
  const user = await client.query(
    `insert into "user" (
       id, name, email, email_verified, first_name, last_name, role
     )
     values ($1, $2, $3, true, $4, $5, $6)
     on conflict (email) do update set
       name = excluded.name,
       email_verified = true,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       role = excluded.role
     returning id`,
    [
      u.id,
      `${u.first_name} ${u.last_name}`,
      u.email,
      u.first_name,
      u.last_name,
      u.role,
    ]
  );
  const user_id = user.rows[0].id;
  const existing = await client.query(
    `select id, password from account
     where user_id = $1 and provider_id = 'credential'
     limit 1`,
    [user_id]
  );
  const row = existing.rows[0];
  if (await password_matches(row?.password, u.password)) return user_id;
  const hash = await hashPassword(u.password);
  if (row) {
    await client.query(
      `update account set password = $1, updated_at = now() where id = $2`,
      [hash, row.id]
    );
  } else {
    await client.query(
      `insert into account (
         id, account_id, provider_id, user_id, password, created_at, updated_at
       )
       values ($1, $2, 'credential', $2, $3, now(), now())`,
      [`${u.id}-credential`, user_id, hash]
    );
  }
  return user_id;
};

const seed = async (client) => {
  await client.query("BEGIN");
  try {
    await client.query(
      `insert into npos (
         registration_number, name, endow_designation, hq_country,
         overview_pt, tagline, published, active
       )
       select 'VERIFY-0002', 'Verify Other Nonprofit', 'Charity', 'United States',
              'Fixture nonprofit for verify-platform.',
              'Fixture nonprofit used by the verify skill', true, true
       where not exists (
         select 1 from npos where registration_number = 'VERIFY-0002'
       )`
    );
    const user_id = await upsert_user(client, MEMBER);
    await upsert_user(client, ADMIN);
    await client.query(
      `insert into user_npo_memberships (user_id, npo_id)
       select $1, id from npos where registration_number = 'VERIFY0001'
       on conflict do nothing`,
      [user_id]
    );
    const member = await client.query(
      `select 1 from user_npo_memberships m
       join npos n on n.id = m.npo_id
       where m.user_id = $1 and n.registration_number = 'VERIFY0001'`,
      [user_id]
    );
    if (member.rowCount === 0) {
      throw new Error("VERIFY0001 is missing; seed.sql did not run");
    }
    await client.query(
      `delete from user_npo_memberships m
       using npos n
       where m.npo_id = n.id
         and m.user_id = $1
         and n.registration_number = 'VERIFY-0002'`,
      [user_id]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
};

const url = local_database();
if (url) {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await seed(client);
    } finally {
      client.release();
    }
    process.stdout.write("seeded member of VERIFY0001 and platform admin\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`seed-member: ${safe(message)}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
