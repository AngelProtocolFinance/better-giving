import { drizzle } from "drizzle-orm/pglite";
import * as schema from "$/pg/schema";
import type { TestDb } from "$/pg/test-utils/pglite";

/** a db on `t`'s connection that records each statement it sends, for a test
 * to read the order a path takes its row locks in. pglite is one connection,
 * so this pins the order, never that a second writer blocks */
export function logged_db(t: TestDb) {
  const queries: string[] = [];
  const db = drizzle(t.client, {
    schema,
    logger: { logQuery: (q) => queries.push(q) },
  });
  return { db, queries };
}

const UPDATE = /^(?:update|delete from) "(\w+)"/;
const FOR = /\sfor (?:update|no key update|share|key share)(?: of "(\w+)")?/;
const FROM = /\sfrom "(\w+)"/;

/** of `tables`, each in the order a statement in `queries` first row-locked
 * it: an update or delete of it, or a select of it `for` a lock. an insert
 * locks no row another writer holds, so it is not counted */
export function lock_order(queries: string[], tables: string[]): string[] {
  const order: string[] = [];
  for (const q of queries) {
    const updated = UPDATE.exec(q)?.[1];
    const lock = FOR.exec(q);
    const table = updated ?? (lock && (lock[1] ?? FROM.exec(q)?.[1]));
    if (table && tables.includes(table) && !order.includes(table)) {
      order.push(table);
    }
  }
  return order;
}
