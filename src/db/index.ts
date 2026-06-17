import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

function getDatabaseConfig() {
  if (process.env.TURSO_DATABASE_URL) {
    return {
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    };
  }

  const url = process.env.DATABASE_URL ?? "file:./.data/caltrack.db";
  if (url.startsWith("file:")) {
    mkdirSync(dirname(url.replace("file:", "")), { recursive: true });
  }

  return { url, authToken: undefined };
}

const client = createClient(getDatabaseConfig());

export const db = drizzle(client, { schema });
export { client as dbClient };
