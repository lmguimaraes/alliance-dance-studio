import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Studios router
  studios: router({
    list: publicProcedure.query(async () => {
      return await db.getAllStudios();
    }),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getStudioById(input.id);
      }),
  }),

  // Bookings router
  bookings: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // Only admins can see all bookings
      if (ctx.user.role !== "admin") {
        throw new Error("Unauthorized");
      }
      return await db.getAllBookings();
    }),
    getByStudioAndDate: publicProcedure
      .input(z.object({ 
        studioId: z.number(), 
        date: z.string() 
      }))
      .query(async ({ input }) => {
        const date = new Date(input.date);
        return await db.getBookingsByStudioAndDate(input.studioId, date);
      }),
    create: publicProcedure
      .input(z.object({
        studioId: z.number(),
        userEmail: z.string().email(),
        userName: z.string(),
        userPhone: z.string().optional(),
        bookingDate: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        specialRequests: z.string().optional(),
        totalPrice: z.number(),
      }))
      .mutation(async ({ input }) => {
        const booking = {
          ...input,
          bookingDate: new Date(input.bookingDate),
          status: "pending" as const,
        };
        return await db.createBooking(booking);
      }),
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "confirmed", "cancelled"]),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized");
        }
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
