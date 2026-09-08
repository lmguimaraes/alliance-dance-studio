import "dotenv/config";
import postgres from "postgres";

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const sql = postgres(databaseUrl, {
  ssl: readBoolean(process.env.DATABASE_SSL, true) ? "require" : false,
  max: 1,
  prepare: false,
});

type SqlExecutor = any;

const studioSeeds = [
  {
    name: "Studio 5",
    description:
      "A bright private studio for rehearsals, lessons, and small groups.",
    capacity: 12,
    size: "Small",
    hourlyRate: 1500,
    groupHourlyRate: 2200,
  },
  {
    name: "Studio 6",
    description:
      "A versatile mirrored studio for classes, practice, and rehearsals.",
    capacity: 20,
    size: "Medium",
    hourlyRate: 1500,
    groupHourlyRate: 2200,
  },
  {
    name: "Studio 7",
    description:
      "A versatile mirrored studio that can be combined with Studio 6.",
    capacity: 20,
    size: "Medium",
    hourlyRate: 1500,
    groupHourlyRate: 2200,
  },
];

async function upsertStudio(
  tx: SqlExecutor,
  seed: (typeof studioSeeds)[number]
): Promise<number> {
  const updated = (await tx`
    UPDATE studios
    SET
      description = ${seed.description},
      capacity = ${seed.capacity},
      size = ${seed.size},
      "hourlyRate" = ${seed.hourlyRate},
      "groupHourlyRate" = ${seed.groupHourlyRate},
      "isActive" = TRUE,
      "updatedAt" = NOW()
    WHERE id = (
      SELECT id FROM studios WHERE name = ${seed.name} ORDER BY id LIMIT 1
    )
    RETURNING id
  `) as Array<{ id: number }>;
  if (updated[0]) return updated[0].id;

  const inserted = (await tx`
    INSERT INTO studios (
      name,
      description,
      capacity,
      size,
      "hourlyRate",
      "groupHourlyRate",
      "isActive",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${seed.name},
      ${seed.description},
      ${seed.capacity},
      ${seed.size},
      ${seed.hourlyRate},
      ${seed.groupHourlyRate},
      TRUE,
      NOW(),
      NOW()
    )
    RETURNING id
  `) as Array<{ id: number }>;
  return inserted[0].id;
}

async function main(): Promise<void> {
  const studioIds = await sql.begin(async transaction => {
    const tx = transaction as unknown as SqlExecutor;
    const ids: number[] = [];

    for (const seed of studioSeeds) ids.push(await upsertStudio(tx, seed));

    for (const studioId of ids) {
      await tx`DELETE FROM time_slots WHERE "studioId" = ${studioId}`;
      for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
        await tx`
          INSERT INTO time_slots (
            "studioId",
            "dayOfWeek",
            "startTime",
            "endTime",
            "isAvailable",
            "createdAt",
            "updatedAt"
          ) VALUES (
            ${studioId},
            ${dayOfWeek},
            '09:00',
            '22:00',
            TRUE,
            NOW(),
            NOW()
          )
        `;
      }
    }

    return ids;
  });

  console.log(`Seeded ${studioIds.length} studios and their weekly availability.`);
}

main()
  .catch(error => {
    console.error("Database seed failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
