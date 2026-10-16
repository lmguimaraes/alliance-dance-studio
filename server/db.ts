import postgres from "postgres";
import { ENV } from "./_core/env";

export type Sql = postgres.Sql;
/** A connection or an open transaction; both run tagged queries. */
export type SqlExecutor = postgres.Sql | postgres.TransactionSql;

let client: Sql | null = null;

export function getSql(): Sql {
  if (!client) {
    if (!ENV.databaseUrl) throw new Error("DATABASE_URL is required.");
    client = postgres(ENV.databaseUrl, {
      ssl: ENV.databaseSsl ? "require" : false,
      max: 10,
      connect_timeout: 10,
      idle_timeout: 20,
      // Supabase's transaction pooler does not support prepared statements.
      prepare: false,
      onnotice: () => undefined,
    });
  }
  return client;
}

export async function closeDatabase(): Promise<void> {
  if (client) await client.end({ timeout: 5 });
  client = null;
}

/** Runs `work` in a transaction. Postgres.js retries nothing implicitly. */
export function inTransaction<T>(
  work: (sql: postgres.TransactionSql) => Promise<T>
): Promise<T> {
  return getSql().begin(work) as Promise<T>;
}
