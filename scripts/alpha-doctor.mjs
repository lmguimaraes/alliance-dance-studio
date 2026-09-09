import "dotenv/config";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { Pool } from "pg";

const failures = [];
const notes = [];
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) failures.push("DATABASE_URL is missing");
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) failures.push("STRIPE_SECRET_KEY must be a Stripe test secret (sk_test_…)");
if (!process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) failures.push("STRIPE_WEBHOOK_SECRET is missing or invalid");
try {
  const base = new URL(process.env.APP_BASE_URL ?? "");
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error();
} catch { failures.push("APP_BASE_URL must be an absolute http(s) URL"); }

const html = await readFile(new URL("../client/index.html", import.meta.url), "utf8");
if (html.includes("%VITE_")) failures.push("client/index.html still contains an unresolved %VITE_*% placeholder");

if (databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const required = await pool.query(`
      WITH expected(table_name, column_name) AS (VALUES
        ('studios', 'hourlyRate'), ('studios', 'groupHourlyRate'), ('studios', 'imageUrl'), ('studios', 'isActive'),
        ('timeSlots', 'studioId'), ('timeSlots', 'dayOfWeek'), ('timeSlots', 'startTime'), ('timeSlots', 'endTime'),
        ('studio_booking_groups', 'checkout_expires_at'), ('studio_booking_items', 'time_range')
      )
      SELECT e.table_name, e.column_name
        FROM expected e
        LEFT JOIN information_schema.columns c
          ON c.table_schema = 'public' AND c.table_name = e.table_name AND c.column_name = e.column_name
       WHERE c.column_name IS NULL
    `);
    for (const row of required.rows) failures.push(`Database is missing public.${row.table_name}.${row.column_name}`);

    const relations = await pool.query(`
      SELECT to_regclass('public."timeSlots"') AS time_slots,
             to_regclass('public.alpha_studio_catalog') AS catalog,
             to_regclass('public.alpha_studio_schedule') AS schedule
    `);
    const row = relations.rows[0];
    if (!row.time_slots) failures.push('Database is missing public."timeSlots"');
    if (!row.catalog) failures.push("Database is missing public.alpha_studio_catalog");
    if (!row.schedule) failures.push("Database is missing public.alpha_studio_schedule");

    const studioCount = await pool.query('SELECT count(*)::integer AS count FROM public.alpha_studio_catalog WHERE is_active IS TRUE');
    notes.push(`${studioCount.rows[0].count} active studio(s) available`);
    if (!studioCount.rows[0].count) failures.push("No active studios are configured");

    const invalidSlots = await pool.query(`
      SELECT count(*)::integer AS count
        FROM public."timeSlots" t
       WHERE t."isAvailable" IS TRUE
         AND NOT EXISTS (SELECT 1 FROM public.alpha_studio_schedule s WHERE s.id = t.id)
    `);
    if (invalidSlots.rows[0].count) notes.push(`${invalidSlots.rows[0].count} malformed schedule row(s) are safely excluded from public availability`);
  } catch (error) {
    failures.push(`Database readiness check failed: ${error instanceof Error ? error.message : "unknown error"}`);
  } finally {
    await pool.end();
  }
}

for (const note of notes) console.log(`INFO: ${note}`);
for (const failure of failures) console.error(`FAIL: ${failure}`);
if (failures.length) process.exit(1);
console.log("PASS: database, Vite, availability, and Stripe test configuration are alpha-ready");
