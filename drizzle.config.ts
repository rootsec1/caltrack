import { defineConfig } from "drizzle-kit";

const localUrl = process.env.DATABASE_URL ?? "file:./.data/caltrack.db";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? localUrl,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
