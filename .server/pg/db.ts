import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { database } from "../env";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

export const db = drizzle(new Pool({ connectionString: database.url }), {
  schema,
});
export type Db = typeof db;
