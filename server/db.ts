import "dotenv/config";
import { eq, and, gte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { 
  InsertUser, 
  users, 
  studios, 
  bookings, 
  timeSlots 
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  console.log("[Database] getDb called");
  console.log("[Database] DATABASE_URL exists:", !!process.env.DATABASE_URL);
  
  if (process.env.DATABASE_URL) {
    console.log("[Database] DATABASE_URL preview:", process.env.DATABASE_URL.substring(0, 60) + "...");
  }

  if (!_db && process.env.DATABASE_URL) {
    try {
      console.log("[Database] Creating postgres client...");
      _client = postgres(process.env.DATABASE_URL, {
        connect_timeout: 10,
        idle_timeout: 20,
        max: 10,
        ssl: 'require',
      });
      _db = drizzle(_client);
      console.log("[Database] Drizzle instance created successfully");
    } catch (error) {
      console.error("[Database] Failed to create client:", error);
      _db = null;
    }
  }

  if (!_db) {
    console.warn("[Database] Database not available");
  }

  return _db;
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  console.log("[Database] Testing connection...");
  const db = await getDb();
  if (!db || !_client) {
    console.error("[Database] No database instance");
    return false;
  }
  
  try {
    const result = await _client`SELECT NOW() as time`;
    console.log("[Database] Connection test successful:", result[0]?.time);
    return true;
  } catch (error) {
    console.error("[Database] Connection test failed:", error);
    return false;
  }
}

// ============================================
// USER QUERIES
// ============================================

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

    // PostgreSQL uses onConflictDoUpdate instead of onDuplicateKeyUpdate
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
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

// ============================================
// STUDIOS QUERIES
// ============================================

export async function getAllStudios() {
  console.log("[Database] getAllStudios called");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get studios: database not available");
    return [];
  }

  try {
    console.log("[Database] Executing studios query...");
    // PostgreSQL uses native boolean
    const result = await db.select().from(studios).where(eq(studios.isActive, true));
    console.log("[Database] Query complete, found:", result.length, "studios");
    return result;
  } catch (error) {
    console.error("[Database] Error fetching studios:", error);
    return [];
  }
}

export async function getStudioById(id: number) {
  console.log("[Database] getStudioById called with id:", id);

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get studio: database not available");
    return undefined;
  }

  try {
    const result = await db.select().from(studios).where(eq(studios.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error("[Database] Error fetching studio:", error);
    return undefined;
  }
}

export async function createStudio(studio: typeof studios.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // PostgreSQL supports .returning()
  const result = await db.insert(studios).values(studio).returning();
  return result[0];
}

// ============================================
// BOOKINGS QUERIES
// ============================================

export async function getAllBookings() {
  console.log("[Database] getAllBookings called");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get bookings: database not available");
    return [];
  }

  try {
    const result = await db.select().from(bookings);
    console.log("[Database] Found", result.length, "bookings");
    return result;
  } catch (error) {
    console.error("[Database] Error fetching bookings:", error);
    return [];
  }
}

export async function getBookingsByStudioAndDate(studioId: number, date: Date) {
  console.log("[Database] getBookingsByStudioAndDate called:", { studioId, date });

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get bookings: database not available");
    return [];
  }

  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await db.select().from(bookings).where(
      and(
        eq(bookings.studioId, studioId),
        gte(bookings.bookingDate, startOfDay),
        lt(bookings.bookingDate, endOfDay)
      )
    );

    console.log("[Database] Found", result.length, "bookings for date");
    return result;
  } catch (error) {
    console.error("[Database] Error fetching bookings by date:", error);
    return [];
  }
}

export async function createBooking(booking: typeof bookings.$inferInsert) {
  console.log("[Database] createBooking called:", booking);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const result = await db.insert(bookings).values(booking).returning();
    console.log("[Database] Booking created:", result[0]);
    return result[0];
  } catch (error) {
    console.error("[Database] Error creating booking:", error);
    throw error;
  }
}

export async function updateBookingStatus(id: number, status: "pending" | "confirmed" | "cancelled") {
  console.log("[Database] updateBookingStatus called:", { id, status });

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db.update(bookings).set({ status }).where(eq(bookings.id, id));
    console.log("[Database] Booking status updated");
  } catch (error) {
    console.error("[Database] Error updating booking status:", error);
    throw error;
  }
}

// ============================================
// TIME SLOTS QUERIES
// ============================================

export async function getTimeSlotsByStudio(studioId: number) {
  console.log("[Database] getTimeSlotsByStudio called:", studioId);

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get time slots: database not available");
    return [];
  }

  try {
    const result = await db.select().from(timeSlots).where(eq(timeSlots.studioId, studioId));
    console.log("[Database] Found", result.length, "time slots");
    return result;
  } catch (error) {
    console.error("[Database] Error fetching time slots:", error);
    return [];
  }
}

export async function createTimeSlot(timeSlot: typeof timeSlots.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(timeSlots).values(timeSlot).returning();
  return result[0];
}

export async function updateTimeSlotAvailability(id: number, isAvailable: boolean) {
  console.log("[Database] updateTimeSlotAvailability called:", { id, isAvailable });

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    // PostgreSQL uses native boolean
    await db.update(timeSlots).set({ isAvailable }).where(eq(timeSlots.id, id));
    console.log("[Database] Time slot availability updated");
  } catch (error) {
    console.error("[Database] Error updating time slot:", error);
    throw error;
  }
}