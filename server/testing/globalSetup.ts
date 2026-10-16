import postgres from "postgres";

/**
 * Database tests share Studio 5, 6 and 7. Create them once, before any test
 * file runs, so parallel files never race to insert duplicates.
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;

  const sql = postgres(url, {
    max: 1,
    ssl: process.env.TEST_DATABASE_SSL === "true" ? "require" : false,
    onnotice: () => undefined,
  });
  try {
    for (const name of ["Studio 5", "Studio 6", "Studio 7"]) {
      const existing = await sql<{ id: number }[]>`
        SELECT id FROM studios WHERE name = ${name} AND "isActive" ORDER BY id LIMIT 1
      `;
      const id =
        existing[0]?.id ??
        (
          await sql<{ id: number }[]>`
            INSERT INTO studios (name, "hourlyRate", "groupHourlyRate", capacity, size)
            VALUES (${name}, 1500, 2200, 20, 'Medium')
            RETURNING id
          `
        )[0].id;
      const hours =
        await sql`SELECT 1 FROM "timeSlots" WHERE "studioId" = ${id} LIMIT 1`;
      if (!hours.length) {
        for (let day = 0; day < 7; day += 1) {
          await sql`
            INSERT INTO "timeSlots" ("studioId", "dayOfWeek", "startTime", "endTime")
            VALUES (${id}, ${day}, '09:00', '22:00')
          `;
        }
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
