import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[database] DATABASE_URL is required");
  process.exit(1);
}

function readBoolean(value, fallback) {
  if (value == null || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(root, "database", "migrations");
const LOCK_KEY = "alliance-dance-studio-migrations";

// One connection: the session-level advisory lock and every migration share it.
const sql = postgres(databaseUrl, {
  max: 1,
  ssl: readBoolean(process.env.DATABASE_SSL, true) ? "require" : false,
  prepare: false,
  onnotice: () => undefined,
});

function checksum(source) {
  return createHash("sha256").update(source).digest("hex");
}

async function resolveHistoryTable() {
  const existing = await sql`
    SELECT quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS qualified_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND lower(c.relname) = lower('_appMigrations')
     ORDER BY CASE WHEN c.relname = '_appMigrations' THEN 0 ELSE 1 END
     LIMIT 1
  `;
  if (existing.length) return existing[0].qualified_name;

  await sql`
    CREATE TABLE public."_appMigrations" (
      id text PRIMARY KEY,
      checksum text NOT NULL,
      "appliedAt" timestamp with time zone NOT NULL DEFAULT now()
    )
  `;
  return 'public."_appMigrations"';
}

let failed = false;
try {
  const files = (await readdir(migrationsDirectory))
    .filter(name => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  await sql`SELECT pg_advisory_lock(hashtext(${LOCK_KEY}))`;
  try {
    const historyTable = await resolveHistoryTable();

    for (const file of files) {
      const source = await readFile(
        path.join(migrationsDirectory, file),
        "utf8"
      );
      const digest = checksum(source);
      const applied = await sql.unsafe(
        `SELECT checksum FROM ${historyTable} WHERE id = $1`,
        [file]
      );

      if (applied.length) {
        if (applied[0].checksum !== digest) {
          throw new Error(
            `Migration checksum mismatch for ${file}; never edit an applied migration`
          );
        }
        console.log(`[database] ${file}: already applied`);
        continue;
      }

      console.log(`[database] ${file}: applying`);
      await sql.begin(async transaction => {
        await transaction.unsafe(source).simple();
        await transaction.unsafe(
          `INSERT INTO ${historyTable} (id, checksum) VALUES ($1, $2)`,
          [file, digest]
        );
      });
      console.log(`[database] ${file}: applied`);
    }
  } finally {
    await sql`SELECT pg_advisory_unlock(hashtext(${LOCK_KEY}))`.catch(
      () => undefined
    );
  }
} catch (error) {
  failed = true;
  console.error(
    `[database] ${error instanceof Error ? error.message : "Migration failed"}`
  );
} finally {
  await sql.end({ timeout: 5 });
}

if (failed) process.exit(1);
