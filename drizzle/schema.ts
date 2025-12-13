import { integer, pgEnum, pgTable, text, timestamp, varchar, boolean, serial } from "drizzle-orm/pg-core";

/**
 * PostgreSQL enums need to be defined separately
 */
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const bookingStatusEnum = pgEnum("booking_status", ["pending", "confirmed", "cancelled"]);

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Studios table - stores information about dance studios available for rental
 */
export const studios = pgTable("studios", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  hourlyRate: integer("hourlyRate").notNull(), // Price in cents to avoid decimal issues
  image: text("image"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Studio = typeof studios.$inferSelect;
export type InsertStudio = typeof studios.$inferInsert;

/**
 * Bookings table - stores studio rental bookings
 */
export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  studioId: integer("studioId").notNull(),
  userEmail: varchar("userEmail", { length: 320 }).notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  userPhone: varchar("userPhone", { length: 50 }),
  bookingDate: timestamp("bookingDate").notNull(),
  startTime: varchar("startTime", { length: 5 }).notNull(), // Format: HH:MM
  endTime: varchar("endTime", { length: 5 }).notNull(), // Format: HH:MM
  status: bookingStatusEnum("status").default("pending").notNull(),
  specialRequests: text("specialRequests"),
  totalPrice: integer("totalPrice").notNull(), // Price in cents
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;

/**
 * Time slots table - defines available time slots for each studio
 */
export const timeSlots = pgTable("timeSlots", {
  id: serial("id").primaryKey(),
  studioId: integer("studioId").notNull(),
  dayOfWeek: integer("dayOfWeek").notNull(), // 0-6 (Sunday-Saturday)
  startTime: varchar("startTime", { length: 5 }).notNull(), // Format: HH:MM
  endTime: varchar("endTime", { length: 5 }).notNull(), // Format: HH:MM
  isAvailable: boolean("isAvailable").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TimeSlot = typeof timeSlots.$inferSelect;
export type InsertTimeSlot = typeof timeSlots.$inferInsert;