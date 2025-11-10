import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Studios queries
export async function getAllStudios() {
  const db = await getDb();
  if (!db) return [];
  const { studios } = await import("../drizzle/schema");
  return await db.select().from(studios).where(eq(studios.isActive, 1));
}

export async function getStudioById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { studios } = await import("../drizzle/schema");
  const result = await db.select().from(studios).where(eq(studios.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createStudio(studio: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { studios } = await import("../drizzle/schema");
  const result = await db.insert(studios).values(studio);
  return result;
}

// Bookings queries
export async function getAllBookings() {
  const db = await getDb();
  if (!db) return [];
  const { bookings } = await import("../drizzle/schema");
  return await db.select().from(bookings);
}

export async function getBookingsByStudioAndDate(studioId: number, date: Date) {
  const db = await getDb();
  if (!db) return [];
  const { bookings } = await import("../drizzle/schema");
  const { and, gte, lt } = await import("drizzle-orm");
  
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return await db.select().from(bookings).where(
    and(
      eq(bookings.studioId, studioId),
      gte(bookings.bookingDate, startOfDay),
      lt(bookings.bookingDate, endOfDay)
    )
  );
}

export async function createBooking(booking: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { bookings } = await import("../drizzle/schema");
  const result = await db.insert(bookings).values(booking);
  return result;
}

export async function updateBookingStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { bookings } = await import("../drizzle/schema");
  await db.update(bookings).set({ status: status as any }).where(eq(bookings.id, id));
}

// Time slots queries
export async function getTimeSlotsByStudio(studioId: number) {
  const db = await getDb();
  if (!db) return [];
  const { timeSlots } = await import("../drizzle/schema");
  return await db.select().from(timeSlots).where(eq(timeSlots.studioId, studioId));
}

export async function createTimeSlot(timeSlot: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { timeSlots } = await import("../drizzle/schema");
  const result = await db.insert(timeSlots).values(timeSlot);
  return result;
}

export async function updateTimeSlotAvailability(id: number, isAvailable: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { timeSlots } = await import("../drizzle/schema");
  await db.update(timeSlots).set({ isAvailable: isAvailable ? 1 : 0 }).where(eq(timeSlots.id, id));
}
