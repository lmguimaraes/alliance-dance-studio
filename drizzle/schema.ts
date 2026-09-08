import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
]);
export const bookingAudienceEnum = pgEnum("booking_audience", [
  "private",
  "group",
]);
export const reservationStatusEnum = pgEnum("reservation_status", [
  "checkout_pending",
  "paid",
  "expired",
  "cancelled",
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
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

export const studios = pgTable("studios", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  capacity: integer("capacity"),
  size: varchar("size", { length: 100 }),
  hourlyRate: integer("hourlyRate").notNull(),
  groupHourlyRate: integer("groupHourlyRate"),
  imageUrl: text("imageUrl"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Studio = typeof studios.$inferSelect;
export type InsertStudio = typeof studios.$inferInsert;

export const reservations = pgTable(
  "reservations",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    userName: varchar("userName", { length: 120 }).notNull(),
    userEmail: varchar("userEmail", { length: 320 }).notNull(),
    userPhone: varchar("userPhone", { length: 40 }),
    audience: bookingAudienceEnum("audience").notNull(),
    specialRequests: text("specialRequests"),
    amountTotal: integer("amountTotal").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: reservationStatusEnum("status")
      .default("checkout_pending")
      .notNull(),
    stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", {
      length: 255,
    }),
    stripePaymentIntentId: varchar("stripePaymentIntentId", {
      length: 255,
    }),
    cancelTokenHash: varchar("cancelTokenHash", { length: 64 }).notNull(),
    holdExpiresAt: timestamp("holdExpiresAt", { withTimezone: true }).notNull(),
    paidAt: timestamp("paidAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    check("reservations_amount_positive", sql`${table.amountTotal} > 0`),
    uniqueIndex("reservations_stripe_session_unique").on(
      table.stripeCheckoutSessionId
    ),
    uniqueIndex("reservations_payment_intent_unique").on(
      table.stripePaymentIntentId
    ),
    index("reservations_status_expiry_idx").on(
      table.status,
      table.holdExpiresAt
    ),
    index("reservations_email_idx").on(table.userEmail),
  ]
);

export type Reservation = typeof reservations.$inferSelect;
export type InsertReservation = typeof reservations.$inferInsert;

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    reservationId: varchar("reservationId", { length: 32 }).references(
      () => reservations.id,
      { onDelete: "restrict" }
    ),
    studioId: integer("studioId")
      .notNull()
      .references(() => studios.id, { onDelete: "restrict" }),
    userName: varchar("userName", { length: 255 }).notNull(),
    userEmail: varchar("userEmail", { length: 255 }).notNull(),
    userPhone: varchar("userPhone", { length: 50 }),
    bookingDate: timestamp("bookingDate").notNull(),
    startTime: varchar("startTime", { length: 5 }).notNull(),
    endTime: varchar("endTime", { length: 5 }).notNull(),
    duration: integer("duration").notNull(),
    totalPrice: integer("totalPrice").notNull(),
    status: bookingStatusEnum("status").default("pending").notNull(),
    specialRequests: text("specialRequests"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("bookings_reservation_idx").on(table.reservationId),
    index("bookings_availability_idx").on(
      table.studioId,
      table.bookingDate,
      table.status
    ),
  ]
);

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;

export const timeSlots = pgTable(
  "time_slots",
  {
    id: serial("id").primaryKey(),
    studioId: integer("studioId")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    dayOfWeek: integer("dayOfWeek").notNull(),
    startTime: varchar("startTime", { length: 5 }).notNull(),
    endTime: varchar("endTime", { length: 5 }).notNull(),
    isAvailable: boolean("isAvailable").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("time_slots_studio_day_idx").on(
      table.studioId,
      table.dayOfWeek,
      table.isAvailable
    ),
  ]
);

export type TimeSlot = typeof timeSlots.$inferSelect;
export type InsertTimeSlot = typeof timeSlots.$inferInsert;
