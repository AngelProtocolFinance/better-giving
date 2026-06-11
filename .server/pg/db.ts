import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { database } from "../env";
import * as schema from "./schema";

const url = database.url;

neonConfig.webSocketConstructor = ws;

// route non-neon hosts (local dev) through the wsproxy container.
// see docker-compose.yml — wsproxy listens on :4444 and tunnels to host pg.
const { hostname, port } = new URL(url);
const is_local =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "::1" ||
  hostname === "host.docker.internal";

if (is_local) {
  // wsproxy reads ?address=<host>:<port> and dials it from inside the container,
  // so the dest must be host.docker.internal — not whatever the app code uses.
  const dest_port = port || "5432";
  neonConfig.wsProxy = () =>
    `localhost:4444/v1?address=host.docker.internal:${dest_port}`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

export const db = drizzle(new Pool({ connectionString: url }), { schema });
export type Db = typeof db;
