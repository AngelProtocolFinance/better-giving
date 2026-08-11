import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { database } from "../env";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

/**
 * send single-statement queries over http instead of the pooled websocket.
 *
 * a websocket borrowed from the pool can be closed by neon between the borrow
 * and the reply, and the driver rejects every in-flight query on it with
 * "Connection terminated unexpectedly" — which surfaced as intermittent 500s on
 * read paths that have no transaction and nothing to reconnect for. an http
 * query carries no connection to lose.
 *
 * transactions are unaffected: drizzle takes them through `pool.connect()`,
 * which keeps the websocket, so multi-statement atomicity still holds. the
 * driver also falls back to the socket if anything registers a pool listener
 * other than "error" — nothing here does.
 */
neonConfig.poolQueryViaFetch = true;

export const db = drizzle(new Pool({ connectionString: database.url }), {
  schema,
});
export type Db = typeof db;
