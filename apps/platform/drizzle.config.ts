import type { Config } from "drizzle-kit";

export default {
  schema: ".server/pg/schema/index.ts",
  out: ".server/pg/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED,
  },
} satisfies Config;
