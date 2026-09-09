import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  bookings,
  studios,
  timeSlots,
  users,
  type Booking,
  type InsertStudio,
  type InsertTimeSlot,
  type InsertUser,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import {uniqueStudiosByName,} from "../shared/studioCatalog";

let sqlClient: ReturnType<typeof postgres> | null = null;
let database: ReturnType<typeof drizzle> | null = null;

function requireDatabaseUrl(): string {
  if (!ENV.databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  return ENV.databaseUrl;
}

export function getSqlClient(): ReturnType<typeof postgres> {
  if (!sqlClient) {
    sqlClient = postgres(requireDatabaseUrl(), {
      ssl: ENV.databaseSsl ? "require" : false,
      max: 10,
      connect_timeout: 10,
      idle_timeout: 20,
      prepare: false,
    });
  }
  return sqlClient;
}

export function getDb(): ReturnType<typeof drizzle> {
  if (!database) database = drizzle(getSqlClient());
  return database;
}

export async function closeDatabase(): Promise<void> {
  if (sqlClient) await sqlClient.end({ timeout: 5 });
  sqlClient = null;
  database = null;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required.");

  const role = user.openId === ENV.ownerOpenId ? "admin" : user.role;
  const update: Partial<InsertUser> = {
    name: user.name,
    email: user.email,
    loginMethod: user.loginMethod,
    lastSignedIn: user.lastSignedIn ?? new Date(),
    updatedAt: new Date(),
  };
  if (role) update.role = role;

  await getDb()
    .insert(users)
    .values({
      ...user,
      role,
      lastSignedIn: user.lastSignedIn ?? new Date(),
    })
    .onConflictDoUpdate({ target: users.openId, set: update });
}

export async function getUserByOpenId(openId: string) {
  const [user] = await getDb()
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return user;
}

export async function getAllStudios() {
  const rows = await getDb()
    .select({
      id: studios.id,
      name: studios.name,
      description: studios.description,
      capacity: studios.capacity,
      size: studios.size,
      hourlyRate: studios.hourlyRate,
      groupHourlyRate: studios.groupHourlyRate,
      imageUrl: studios.imageUrl,
      isActive: studios.isActive,
    })
    .from(studios)
    .where(eq(studios.isActive, true))
    .orderBy(studios.id);
    
    return uniqueStudiosByName(rows);
}

export async function getStudioById(id: number) {
  const [studio] = await getDb()
    .select()
    .from(studios)
    .where(and(eq(studios.id, id), eq(studios.isActive, true)))
    .limit(1);
  return studio;
}

export async function createStudio(studio: InsertStudio) {
  const [created] = await getDb().insert(studios).values(studio).returning();
  return created;
}

export async function getAllBookings(): Promise<Booking[]> {
  return getDb().select().from(bookings).orderBy(desc(bookings.createdAt));
}

export async function getBookingById(id: number): Promise<Booking | undefined> {
  const [booking] = await getDb()
    .select()
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);
  return booking;
}

export async function updateBookingStatus(
  id: number,
  status: Booking["status"]
): Promise<Booking | undefined> {
  const [updated] = await getDb()
    .update(bookings)
    .set({ status, updatedAt: new Date() })
    .where(eq(bookings.id, id))
    .returning();
  return updated;
}

export async function getTimeSlotsByStudio(studioId: number) {
  return getDb()
    .select()
    .from(timeSlots)
    .where(eq(timeSlots.studioId, studioId))
    .orderBy(timeSlots.dayOfWeek, timeSlots.startTime);
}

export async function createTimeSlot(slot: InsertTimeSlot) {
  const [created] = await getDb().insert(timeSlots).values(slot).returning();
  return created;
}

export async function updateTimeSlotAvailability(
  id: number,
  isAvailable: boolean
) {
  const [updated] = await getDb()
    .update(timeSlots)
    .set({ isAvailable, updatedAt: new Date() })
    .where(eq(timeSlots.id, id))
    .returning();
  return updated;
}
