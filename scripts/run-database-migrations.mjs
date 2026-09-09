import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[database] DATABASE_URL is required");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(root, "drizzle", "migrations");
const pool = new Pool({ connectionString: databaseUrl, max: 2 });

function checksum(source) {
  return createHash("sha256").update(source).digest("hex");
}

async function resolveHistoryTable(client) {
  const existing = await client.query(`
    SELECT quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS qualified_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND lower(c.relname) = lower('_appMigrations')
     ORDER BY CASE WHEN c.relname = '_appMigrations' THEN 0 ELSE 1 END
     LIMIT 1
  `);

  if (existing.rowCount) return existing.rows[0].qualified_name;

  await client.query(`
    CREATE TABLE public."_appMigrations" (
      id text PRIMARY KEY,
      checksum text NOT NULL,
      "appliedAt" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  return 'public."_appMigrations"';
}

let failed = false;
try {
  const files = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const client = await pool.connect();
  try {
    const historyTable = await resolveHistoryTable(client);
    await client.query("SELECT pg_advisory_lock(hashtext($1))", ["alliance-dance-studio-migrations"]);

    for (const file of files) {
      const source = await readFile(path.join(migrationsDirectory, file), "utf8");
      const digest = checksum(source);
      const applied = await client.query(
        `SELECT checksum FROM ${historyTable} WHERE id = $1`,
        [file],
      );

      if (applied.rowCount) {
        if (applied.rows[0].checksum !== digest) {
          throw new Error(`Migration checksum mismatch for ${file}; do not edit an applied migration`);
        }
        console.log(`[database] ${file}: already applied`);
        continue;
      }

      console.log(`[database] ${file}: applying`);
      await client.query("BEGIN");
      try {
        await client.query(source);
        await client.query(
          `INSERT INTO ${historyTable} (id, checksum) VALUES ($1, $2)`,
          [file, digest],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      console.log(`[database] ${file}: applied`);
    }
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["alliance-dance-studio-migrations"]); } catch {}
    client.release();
  }
} catch (error) {
  failed = true;
  console.error(`[database] ${error instanceof Error ? error.message : "Migration failed"}`);
} finally {
  await pool.end();
}

if (failed) process.exit(1);
