import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";

const START_STEP_MINUTES = 15;
const DURATION_STEP_MINUTES = 30;
const MIN_DURATION_MINUTES = 30;
const MAX_DURATION_MINUTES = 8 * 60;

type Segment = { start: number; end: number }; // minutes since midnight [start, end)

const timeToMinutes = (time: string): number | null => {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => {
  // half-open intervals: [start, end)
  return aStart < bEnd && aEnd > bStart;
};

const mergeSegments = (segments: Segment[]): Segment[] => {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged: Segment[] = [];
  for (const seg of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...seg });
      continue;
    }
    if (seg.start <= last.end) {
      last.end = Math.max(last.end, seg.end);
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
};

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts,
  // all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Studios router
  studios: router({
    list: publicProcedure.query(async () => {
      return await db.getAllStudios();
    }),

    // Debug endpoint (kept from your snippet)
    test: publicProcedure.query(async () => {
      const connected = await db.testConnection();
      const studios = await db.getAllStudios();
      return {
        dbUrlExists: !!process.env.DATABASE_URL,
        connected,
        studioCount: studios.length,
        timestamp: new Date().toISOString(),
      };
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getStudioById(input.id);
      }),
  }),

  // Bookings router
  bookings: router({
    list: adminProcedure.query(async () => {
      return await db.getAllBookings();
    }),

    getByStudioAndDate: publicProcedure
      .input(
        z.object({
          studioId: z.number(),
          date: z.string(),
        })
      )
      .query(async ({ input }) => {
        const date = new Date(input.date);
        if (Number.isNaN(date.getTime())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid date" });
        }
        return await db.getBookingsByStudioAndDate(input.studioId, date);
      }),

    create: publicProcedure
      .input(
        z.object({
          studioId: z.number(),
          userEmail: z.string().email(),
          userName: z.string().min(1),
          userPhone: z.string().optional(),
          bookingDate: z.string(),
          startTime: z.string().regex(/^\d{2}:\d{2}$/),
          endTime: z.string().regex(/^\d{2}:\d{2}$/),
          specialRequests: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const bookingDate = new Date(input.bookingDate);
        if (Number.isNaN(bookingDate.getTime())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid booking date" });
        }

        // Reject bookings in the past (server time)
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        const bookingDay = new Date(bookingDate);
        bookingDay.setHours(0, 0, 0, 0);

        if (bookingDay.getTime() < today.getTime()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Booking date is in the past" });
        }

        const startMin = timeToMinutes(input.startTime);
        const endMin = timeToMinutes(input.endTime);

        if (startMin === null || endMin === null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid time format" });
        }
        if (endMin <= startMin) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "End time must be after start time" });
        }

        const durationMin = endMin - startMin;

        // Enforce increments & duration bounds
        if (startMin % START_STEP_MINUTES !== 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Start time must be in 15-minute increments",
          });
        }
        if (durationMin < MIN_DURATION_MINUTES || durationMin > MAX_DURATION_MINUTES) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Duration must be between 30 minutes and 8 hours",
          });
        }
        if (durationMin % DURATION_STEP_MINUTES !== 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Duration must be in 30-minute increments",
          });
        }

        // Optional: if booking is today, prevent selecting a past time
        if (bookingDay.getTime() === today.getTime()) {
          const nowMin = now.getHours() * 60 + now.getMinutes();
          if (startMin < nowMin) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Start time is in the past" });
          }
        }

        // Ensure studio exists + compute price server-side
        const studio = await db.getStudioById(input.studioId);
        if (!studio) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Studio not found" });
        }

        const totalPrice = Math.round((studio.hourlyRate * durationMin) / 60);

        // Validate against availability (timeSlots)
        const dayOfWeek = bookingDay.getDay();
        const allSlots = await db.getTimeSlotsByStudio(input.studioId);

        const segmentsRaw: Segment[] = allSlots
          .filter((s) => s.dayOfWeek === dayOfWeek && s.isAvailable)
          .map((s) => {
            const sMin = timeToMinutes(s.startTime);
            const eMin = timeToMinutes(s.endTime);
            if (sMin === null || eMin === null) return null;
            if (eMin <= sMin) return null;
            return { start: sMin, end: eMin };
          })
          .filter((x): x is Segment => !!x);

        if (segmentsRaw.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Studio is not available on this day",
          });
        }

        const segments = mergeSegments(segmentsRaw);

        const withinAvailability = segments.some(
          (seg) => startMin >= seg.start && endMin <= seg.end
        );
        if (!withinAvailability) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected time is outside studio availability",
          });
        }

        // Validate overlap with existing bookings (pending/confirmed)
        const existing = await db.getBookingsByStudioAndDate(input.studioId, bookingDate);

        const conflict = existing
          .filter((b) => b.status === "pending" || b.status === "confirmed")
          .some((b) => {
            const bStart = timeToMinutes(b.startTime);
            const bEnd = timeToMinutes(b.endTime);
            if (bStart === null || bEnd === null) return false;
            return overlaps(startMin, endMin, bStart, bEnd);
          });

        if (conflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That time is no longer available. Please choose another slot.",
          });
        }

        const booking = {
          studioId: input.studioId,
          userEmail: input.userEmail,
          userName: input.userName,
          userPhone: input.userPhone,
          bookingDate: bookingDate,
          startTime: input.startTime,
          endTime: input.endTime,
          specialRequests: input.specialRequests,
          totalPrice,
          status: "pending" as const,
        };

        return await db.createBooking(booking);
      }),

    updateStatus: adminProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pending", "confirmed", "cancelled"]),
        })
      )
      .mutation(async ({ input }) => {
        await db.updateBookingStatus(input.id, input.status);
        return { success: true };
      }),
  }),

  // Time slots router
  timeSlots: router({
    getByStudio: publicProcedure
      .input(z.object({ studioId: z.number() }))
      .query(async ({ input }) => {
        return await db.getTimeSlotsByStudio(input.studioId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
