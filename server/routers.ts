import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import {
  BookingError,
  type BookingErrorCode,
} from "./bookingPolicy";
import { getBookingSchedule } from "./bookingRepository";
import * as db from "./db";
import {
  createFixedWindowRateLimiter,
  RateLimitError,
} from "./rateLimit";
import {
  cancelStripeCheckout,
  createStripeCheckout,
  fulfillCheckoutSession,
} from "./stripe";

const scheduleLimiter = createFixedWindowRateLimiter({
  limit: 120,
  windowMs: 10 * 60 * 1000,
});
const checkoutLimiter = createFixedWindowRateLimiter({
  limit: 6,
  windowMs: 10 * 60 * 1000,
});
const checkoutStatusLimiter = createFixedWindowRateLimiter({
  limit: 30,
  windowMs: 10 * 60 * 1000,
});

const bookingErrorCodes: Record<BookingErrorCode,
  "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "PRECONDITION_FAILED" | "INTERNAL_SERVER_ERROR"
> = {
  BAD_REQUEST: "BAD_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PRECONDITION_FAILED: "PRECONDITION_FAILED",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
};

function clientKey(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

async function runBookingAction<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `${error.message} Retry in ${error.retryAfterSeconds} seconds.`,
      });
    }
    if (error instanceof BookingError) {
      throw new TRPCError({
        code: bookingErrorCodes[error.code],
        message: error.message,
      });
    }

    console.error("Reservation operation failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "The reservation service is temporarily unavailable.",
    });
  }
}

const studioIdsSchema = z
  .array(z.number().int().positive())
  .min(1)
  .max(2);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const startTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const endTimeSchema = z
  .string()
  .regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  studios: router({
    list: publicProcedure.query(() => db.getAllStudios()),
    getById: publicProcedure
      .input(z.object({ id: z.number().int().positive() }).strict())
      .query(({ input }) => db.getStudioById(input.id)),
  }),

  bookings: router({
    list: adminProcedure.query(() => db.getAllBookings()),

    schedule: publicProcedure
      .input(
        z
          .object({
            studioIds: studioIdsSchema,
            date: dateSchema,
          })
          .strict()
      )
      .query(({ input, ctx }) =>
        runBookingAction(() => {
          scheduleLimiter.consume(clientKey(ctx.req));
          return getBookingSchedule(input);
        })
      ),

    createCheckout: publicProcedure
      .input(
        z
          .object({
            studioIds: studioIdsSchema,
            date: dateSchema,
            startTime: startTimeSchema,
            endTime: endTimeSchema,
            audience: z.enum(["private", "group"]),
            userName: z.string().trim().min(2).max(120),
            userEmail: z.string().trim().email().max(254),
            userPhone: z.string().trim().max(40).optional(),
            specialRequests: z.string().trim().max(1000).optional(),
          })
          .strict()
      )
      .mutation(({ input, ctx }) =>
        runBookingAction(async () => {
          checkoutLimiter.consume(clientKey(ctx.req));
          return createStripeCheckout({
            ...input,
            userPhone: input.userPhone || undefined,
            specialRequests: input.specialRequests || undefined,
          });
        })
      ),

    confirmCheckout: publicProcedure
      .input(
        z
          .object({
            sessionId: z
              .string()
              .max(255)
              .regex(/^cs_(?:test|live)_[A-Za-z0-9]+$/),
          })
          .strict()
      )
      .mutation(({ input, ctx }) =>
        runBookingAction(async () => {
          checkoutStatusLimiter.consume(clientKey(ctx.req));
          return fulfillCheckoutSession(input.sessionId);
        })
      ),

    cancelCheckout: publicProcedure
      .input(
        z
          .object({
            reservationId: z
              .string()
              .min(20)
              .max(32)
              .regex(/^[A-Za-z0-9_-]+$/),
            cancelToken: z
              .string()
              .min(20)
              .max(100)
              .regex(/^[A-Za-z0-9_-]+$/),
          })
          .strict()
      )
      .mutation(({ input, ctx }) =>
        runBookingAction(async () => {
          checkoutStatusLimiter.consume(clientKey(ctx.req));
          return cancelStripeCheckout(input);
        })
      ),

    updateStatus: adminProcedure
      .input(
        z
          .object({
            id: z.number().int().positive(),
            status: z.enum(["pending", "confirmed", "cancelled"]),
          })
          .strict()
      )
      .mutation(async ({ input }) => {
        const existing = await db.getBookingById(input.id);
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Booking not found.",
          });
        }
        if (existing.reservationId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Stripe reservation status is payment-managed. Use a reviewed cancellation/refund workflow instead.",
          });
        }

        await db.updateBookingStatus(input.id, input.status);
        return { success: true } as const;
      }),
  }),

  timeSlots: router({
    getByStudio: publicProcedure
      .input(z.object({ studioId: z.number().int().positive() }).strict())
      .query(({ input }) => db.getTimeSlotsByStudio(input.studioId)),
  }),
});

export type AppRouter = typeof appRouter;
