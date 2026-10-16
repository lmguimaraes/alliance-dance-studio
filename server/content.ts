import {
  minutesToTime,
  timeToMinutes,
  type ClassLevel,
} from "../shared/booking";
import { uniqueStudiosByName } from "../shared/studioCatalog";
import { getSql, inTransaction } from "./db";
import { BookingError } from "./booking/rules";

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

export type DanceClass = {
  id: number;
  title: string;
  style: string;
  level: ClassLevel;
  instructorName: string | null;
  instructorInstagram: string | null;
  instructorImageUrl: string | null;
  studioId: number | null;
  studioName: string | null;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  startsOn: string | null;
  endsOn: string | null;
  isActive: boolean;
};

export type DanceClassInput = Omit<DanceClass, "id" | "studioName">;

async function selectClasses(activeOnly: boolean): Promise<DanceClass[]> {
  const sql = getSql();
  return sql<DanceClass[]>`
    SELECT
      c.id,
      c.title,
      c.style,
      c.level,
      c.instructor_name AS "instructorName",
      c.instructor_instagram AS "instructorInstagram",
      c.instructor_image_url AS "instructorImageUrl",
      c.studio_id AS "studioId",
      s.name AS "studioName",
      c.day_of_week AS "dayOfWeek",
      to_char(c.start_time, 'HH24:MI') AS "startTime",
      c.duration_minutes AS "durationMinutes",
      to_char(c.starts_on, 'YYYY-MM-DD') AS "startsOn",
      to_char(c.ends_on, 'YYYY-MM-DD') AS "endsOn",
      c.is_active AS "isActive"
    FROM classes AS c
    LEFT JOIN studios AS s ON s.id = c.studio_id
    WHERE ${activeOnly} = FALSE OR c.is_active IS TRUE
    ORDER BY c.day_of_week, c.start_time, c.title
  `;
}

export const listPublicClasses = () => selectClasses(true);
export const listAllClasses = () => selectClasses(false);

function assertClassFitsDay(input: DanceClassInput): void {
  if (timeToMinutes(input.startTime) + input.durationMinutes > 24 * 60) {
    throw new BookingError("BAD_REQUEST", "A class must end by midnight.");
  }
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
    throw new BookingError(
      "BAD_REQUEST",
      "The end date must be on or after the start date."
    );
  }
}

export async function createClass(
  input: DanceClassInput
): Promise<{ id: number }> {
  assertClassFitsDay(input);
  const [row] = await getSql()<{ id: number }[]>`
    INSERT INTO classes (
      title, style, level, instructor_name, instructor_instagram, instructor_image_url,
      studio_id, day_of_week, start_time, duration_minutes, starts_on, ends_on, is_active
    ) VALUES (
      ${input.title}, ${input.style}, ${input.level}, ${input.instructorName},
      ${input.instructorInstagram}, ${input.instructorImageUrl}, ${input.studioId},
      ${input.dayOfWeek}, ${input.startTime}::time, ${input.durationMinutes},
      ${input.startsOn}::date, ${input.endsOn}::date, ${input.isActive}
    )
    RETURNING id
  `;
  return row;
}

export async function updateClass(
  id: number,
  input: DanceClassInput
): Promise<void> {
  assertClassFitsDay(input);
  const rows = await getSql()`
    UPDATE classes SET
      title = ${input.title},
      style = ${input.style},
      level = ${input.level},
      instructor_name = ${input.instructorName},
      instructor_instagram = ${input.instructorInstagram},
      instructor_image_url = ${input.instructorImageUrl},
      studio_id = ${input.studioId},
      day_of_week = ${input.dayOfWeek},
      start_time = ${input.startTime}::time,
      duration_minutes = ${input.durationMinutes},
      starts_on = ${input.startsOn}::date,
      ends_on = ${input.endsOn}::date,
      is_active = ${input.isActive},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id
  `;
  if (!rows.length) throw new BookingError("NOT_FOUND", "Class not found.");
}

export async function deleteClass(id: number): Promise<void> {
  const rows =
    await getSql()`DELETE FROM classes WHERE id = ${id} RETURNING id`;
  if (!rows.length) throw new BookingError("NOT_FOUND", "Class not found.");
}

// ---------------------------------------------------------------------------
// Class passes
// ---------------------------------------------------------------------------

export type PassCategory = "classes" | "rehearsal";

export type ClassPass = {
  id: number;
  category: PassCategory;
  nameEn: string;
  nameFr: string | null;
  nameEs: string | null;
  detailsEn: string | null;
  detailsFr: string | null;
  detailsEs: string | null;
  priceCents: number;
  currency: string;
  stripeUrl: string;
  sortOrder: number;
  isActive: boolean;
};

export type ClassPassInput = Omit<ClassPass, "id">;

async function selectPasses(activeOnly: boolean): Promise<ClassPass[]> {
  return getSql()<ClassPass[]>`
    SELECT
      id, category,
      name_en AS "nameEn", name_fr AS "nameFr", name_es AS "nameEs",
      details_en AS "detailsEn", details_fr AS "detailsFr", details_es AS "detailsEs",
      price_cents AS "priceCents", currency, stripe_url AS "stripeUrl",
      sort_order AS "sortOrder", is_active AS "isActive"
    FROM class_passes
    WHERE ${activeOnly} = FALSE OR is_active IS TRUE
    ORDER BY category, sort_order, id
  `;
}

export const listPublicPasses = () => selectPasses(true);
export const listAllPasses = () => selectPasses(false);

export async function createPass(
  input: ClassPassInput
): Promise<{ id: number }> {
  const [row] = await getSql()<{ id: number }[]>`
    INSERT INTO class_passes (
      category, name_en, name_fr, name_es, details_en, details_fr, details_es,
      price_cents, currency, stripe_url, sort_order, is_active
    ) VALUES (
      ${input.category}, ${input.nameEn}, ${input.nameFr}, ${input.nameEs},
      ${input.detailsEn}, ${input.detailsFr}, ${input.detailsEs},
      ${input.priceCents}, ${input.currency}, ${input.stripeUrl},
      ${input.sortOrder}, ${input.isActive}
    )
    RETURNING id
  `;
  return row;
}

export async function updatePass(
  id: number,
  input: ClassPassInput
): Promise<void> {
  const rows = await getSql()`
    UPDATE class_passes SET
      category = ${input.category},
      name_en = ${input.nameEn},
      name_fr = ${input.nameFr},
      name_es = ${input.nameEs},
      details_en = ${input.detailsEn},
      details_fr = ${input.detailsFr},
      details_es = ${input.detailsEs},
      price_cents = ${input.priceCents},
      currency = ${input.currency},
      stripe_url = ${input.stripeUrl},
      sort_order = ${input.sortOrder},
      is_active = ${input.isActive},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id
  `;
  if (!rows.length) throw new BookingError("NOT_FOUND", "Pass not found.");
}

export async function deletePass(id: number): Promise<void> {
  const rows =
    await getSql()`DELETE FROM class_passes WHERE id = ${id} RETURNING id`;
  if (!rows.length) throw new BookingError("NOT_FOUND", "Pass not found.");
}

// ---------------------------------------------------------------------------
// Discover entries
// ---------------------------------------------------------------------------

export type DiscoverSection = "directors" | "dancers" | "teams" | "awards";

export type DiscoverEntry = {
  id: number;
  section: DiscoverSection;
  name: string;
  subtitleEn: string | null;
  subtitleFr: string | null;
  subtitleEs: string | null;
  bodyEn: string | null;
  bodyFr: string | null;
  bodyEs: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  year: number | null;
  sortOrder: number;
  isPublished: boolean;
};

export type DiscoverEntryInput = Omit<DiscoverEntry, "id">;

async function selectEntries(
  section: DiscoverSection | null,
  publishedOnly: boolean
): Promise<DiscoverEntry[]> {
  return getSql()<DiscoverEntry[]>`
    SELECT
      id, section, name,
      subtitle_en AS "subtitleEn", subtitle_fr AS "subtitleFr", subtitle_es AS "subtitleEs",
      body_en AS "bodyEn", body_fr AS "bodyFr", body_es AS "bodyEs",
      image_url AS "imageUrl", link_url AS "linkUrl", year,
      sort_order AS "sortOrder", is_published AS "isPublished"
    FROM discover_entries
    WHERE (${section}::text IS NULL OR section = ${section})
      AND (${publishedOnly} = FALSE OR is_published IS TRUE)
    ORDER BY section, sort_order, year DESC NULLS LAST, id
  `;
}

export const listPublicEntries = (section: DiscoverSection) =>
  selectEntries(section, true);
export const listAllEntries = () => selectEntries(null, false);

export async function createEntry(
  input: DiscoverEntryInput
): Promise<{ id: number }> {
  const [row] = await getSql()<{ id: number }[]>`
    INSERT INTO discover_entries (
      section, name, subtitle_en, subtitle_fr, subtitle_es, body_en, body_fr, body_es,
      image_url, link_url, year, sort_order, is_published
    ) VALUES (
      ${input.section}, ${input.name}, ${input.subtitleEn}, ${input.subtitleFr},
      ${input.subtitleEs}, ${input.bodyEn}, ${input.bodyFr}, ${input.bodyEs},
      ${input.imageUrl}, ${input.linkUrl}, ${input.year}, ${input.sortOrder},
      ${input.isPublished}
    )
    RETURNING id
  `;
  return row;
}

export async function updateEntry(
  id: number,
  input: DiscoverEntryInput
): Promise<void> {
  const rows = await getSql()`
    UPDATE discover_entries SET
      section = ${input.section},
      name = ${input.name},
      subtitle_en = ${input.subtitleEn},
      subtitle_fr = ${input.subtitleFr},
      subtitle_es = ${input.subtitleEs},
      body_en = ${input.bodyEn},
      body_fr = ${input.bodyFr},
      body_es = ${input.bodyEs},
      image_url = ${input.imageUrl},
      link_url = ${input.linkUrl},
      year = ${input.year},
      sort_order = ${input.sortOrder},
      is_published = ${input.isPublished},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id
  `;
  if (!rows.length) throw new BookingError("NOT_FOUND", "Entry not found.");
}

export async function deleteEntry(id: number): Promise<void> {
  const rows =
    await getSql()`DELETE FROM discover_entries WHERE id = ${id} RETURNING id`;
  if (!rows.length) throw new BookingError("NOT_FOUND", "Entry not found.");
}

// ---------------------------------------------------------------------------
// Studios
// ---------------------------------------------------------------------------

export type StudioHours = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type AdminStudio = {
  id: number;
  name: string;
  capacity: number | null;
  size: string | null;
  hourlyRate: number;
  groupHourlyRate: number;
  imageUrl: string | null;
  isActive: boolean;
  hours: StudioHours[];
};

export type PublicStudio = {
  id: number;
  name: string;
  capacity: number | null;
  size: string | null;
  imageUrl: string | null;
};

export async function listPublicStudios(): Promise<PublicStudio[]> {
  const rows = await getSql()<PublicStudio[]>`
    SELECT id, name, capacity, size,
           COALESCE(NULLIF("imageUrl", ''), NULLIF(image, '')) AS "imageUrl"
    FROM studios
    WHERE "isActive" = TRUE
    ORDER BY id
  `;
  return uniqueStudiosByName(rows.map(row => ({ ...row })));
}

export async function listAdminStudios(): Promise<AdminStudio[]> {
  const sql = getSql();
  const [studios, hours] = await Promise.all([
    sql<Omit<AdminStudio, "hours">[]>`
      SELECT id, name, capacity, size, "hourlyRate",
             COALESCE("groupHourlyRate", "hourlyRate") AS "groupHourlyRate",
             COALESCE(NULLIF("imageUrl", ''), NULLIF(image, '')) AS "imageUrl",
             "isActive"
      FROM studios
      ORDER BY id
    `,
    sql<(StudioHours & { studioId: number })[]>`
      SELECT "studioId", "dayOfWeek", "startTime", "endTime"
      FROM "timeSlots"
      WHERE "isAvailable" = TRUE
      ORDER BY "studioId", "dayOfWeek", "startTime"
    `,
  ]);

  return studios.map(studio => ({
    ...studio,
    hours: hours
      .filter(row => row.studioId === studio.id)
      .map(({ dayOfWeek, startTime, endTime }) => ({
        dayOfWeek,
        startTime,
        endTime,
      })),
  }));
}

export type AdminStudioInput = {
  capacity: number | null;
  size: string | null;
  hourlyRate: number;
  groupHourlyRate: number;
  imageUrl: string | null;
  isActive: boolean;
  hours: StudioHours[];
};

export async function updateStudio(
  id: number,
  input: AdminStudioInput
): Promise<void> {
  for (const window of input.hours) {
    if (timeToMinutes(window.endTime) <= timeToMinutes(window.startTime)) {
      throw new BookingError(
        "BAD_REQUEST",
        "Each closing time must be after its opening time."
      );
    }
  }

  await inTransaction(async sql => {
    const rows = await sql`
      UPDATE studios SET
        capacity = ${input.capacity ?? 1},
        size = ${input.size ?? "Not specified"},
        "hourlyRate" = ${input.hourlyRate},
        "groupHourlyRate" = ${input.groupHourlyRate},
        "imageUrl" = ${input.imageUrl},
        "isActive" = ${input.isActive},
        "updatedAt" = NOW()
      WHERE id = ${id}
      RETURNING id
    `;
    if (!rows.length) throw new BookingError("NOT_FOUND", "Studio not found.");

    await sql`DELETE FROM "timeSlots" WHERE "studioId" = ${id}`;
    for (const window of input.hours) {
      await sql`
        INSERT INTO "timeSlots" (
          "studioId", "dayOfWeek", "startTime", "endTime", "isAvailable", "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${window.dayOfWeek},
          ${minutesToTime(timeToMinutes(window.startTime))},
          ${minutesToTime(timeToMinutes(window.endTime))},
          TRUE, NOW(), NOW()
        )
      `;
    }
  });
}
