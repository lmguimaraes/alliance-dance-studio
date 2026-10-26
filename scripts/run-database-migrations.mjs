import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/*
 * Applies database/migrations/*.sql in file-name order and records each one in
 * "_appMigrations" with a checksum. The server runs this every time it starts
 * (including watch restarts in development); `pnpm db:migrate` runs it by hand.
 */

const LOCK_KEY = "alliance-dance-studio-migrations";

function readBoolean(value, fallback) {
  if (value == null || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

// The repository root: this file lives in scripts/, and the server bundle in
// dist/, so one level up is the root either way.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(root, "database", "migrations");

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

// Git on Windows may check migrations out with CRLF line endings, and earlier
// runs may have recorded either form. Line endings never change what a
// migration does, so both forms count as the same file. New runs record LF.
function checksums(source) {
  const lf = source.replace(/\r\n/g, "\n");
  return {
    recorded: sha256(lf),
    accepted: new Set([
      sha256(source),
      sha256(lf),
      sha256(lf.replace(/\n/g, "\r\n")),
    ]),
  };
}

async function resolveHistoryTable(sql) {
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

/** Applies pending migrations. Throws if one fails or was edited after it ran. */
export async function runMigrations({ log = console.log } = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  // One connection: the session-level advisory lock and every migration share it.
  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: readBoolean(process.env.DATABASE_SSL, true) ? "require" : false,
    prepare: false,
    onnotice: () => undefined,
  });

  try {
    const files = (await readdir(migrationsDirectory))
      .filter(name => name.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    await sql`SELECT pg_advisory_lock(hashtext(${LOCK_KEY}))`;
    try {
      const historyTable = await resolveHistoryTable(sql);
      let applied = 0;

      for (const file of files) {
        const source = await readFile(
          path.join(migrationsDirectory, file),
          "utf8"
        );
        const digest = checksums(source);
        const history = await sql.unsafe(
          `SELECT checksum FROM ${historyTable} WHERE id = $1`,
          [file]
        );

        if (history.length) {
          if (!digest.accepted.has(history[0].checksum)) {
            throw new Error(
              `Migration checksum mismatch for ${file}; never edit an applied migration`
            );
          }
          continue;
        }

        log(`[database] ${file}: applying`);
        await sql.begin(async transaction => {
          await transaction.unsafe(source).simple();
          await transaction.unsafe(
            `INSERT INTO ${historyTable} (id, checksum) VALUES ($1, $2)`,
            [file, digest.recorded]
          );
        });
        log(`[database] ${file}: applied`);
        applied += 1;
      }

      log(
        applied
          ? `[database] ${applied} migration(s) applied`
          : "[database] up to date"
      );
    } finally {
      await sql`SELECT pg_advisory_unlock(hashtext(${LOCK_KEY}))`.catch(
        () => undefined
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Run directly (pnpm db:migrate). The name check keeps this from firing when
// the file is bundled into the server, where import.meta.url is dist/index.js.
const thisFile = fileURLToPath(import.meta.url);
if (
  path.basename(thisFile) === "run-database-migrations.mjs" &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === thisFile
) {
  runMigrations().catch(error => {
    console.error(
      `[database] ${error instanceof Error ? error.message : "Migration failed"}`
    );
    process.exit(1);
  });
}
