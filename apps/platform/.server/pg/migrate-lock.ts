/** every migrate run takes this key; arbitrary, but one value repo-wide */
export const MIGRATE_LOCK_KEY = "7306195201";

/**
 * neon's `-pooler` host is pgbouncer in transaction mode: a session lock taken
 * there stays on whichever backend served it, and the unlock lands on another
 * — the lock leaks and every later migrate waits on it forever
 */
export const is_pooled_url = (url: string) =>
  new URL(url).hostname.split(".")[0].endsWith("-pooler");

/** the slice of a pg client the lock uses — neon's `Client`, or a test fake */
export interface LockClient {
  query(sql: string, params: unknown[]): Promise<unknown>;
}

/**
 * runs `work` while `client`'s session holds `pg_advisory_lock(key)`; a second
 * caller blocks in `pg_advisory_lock` until this one unlocks or disconnects.
 * session-level, so `work` may use other connections — the lock serializes
 * callers, it doesn't wrap their statements.
 */
export async function with_advisory_lock<T>(
  client: LockClient,
  key: string,
  work: () => Promise<T>
): Promise<T> {
  await client.query("select pg_advisory_lock($1::bigint)", [key]);
  try {
    return await work();
  } finally {
    // a failed unlock must not mask work's own error; closing the session
    // releases the lock anyway
    await client
      .query("select pg_advisory_unlock($1::bigint)", [key])
      .catch((err: unknown) => console.warn("advisory unlock failed:", err));
  }
}
