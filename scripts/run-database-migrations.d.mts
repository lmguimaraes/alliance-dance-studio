/** Applies pending database migrations (see run-database-migrations.mjs). */
export function runMigrations(options?: {
  log?: (message: string) => void;
}): Promise<void>;
