import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MAX_CART_ITEMS, MAX_REPEAT_WEEKS } from "../shared/booking";
import { ENV } from "./_core/env";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import {
  endAdminSession,
  passwordMatches,
  startAdminSession,
} from "./admin/auth";
import {
  cancelLegacyBooking,
  createAdminBooking,
  listAdminBookings,
  removeAdminBooking,
  updateAdminBooking,
} from "./admin/bookings";
import { getRentalDay } from "./booking/day";
import { quoteOrder } from "./booking/orders";
import { BookingError, type BookingErrorCode } from "./booking/rules";
import {
  createClass,
  createEntry,
  createPass,
  deleteClass,
  deleteEntry,
  deletePass,
  listAdminStudios,
  listAllClasses,
  listAllEntries,
  listAllPasses,
  listPublicClasses,
  listPublicEntries,
  listPublicPasses,
  listPublicStudios,
  updateClass,
  updateEntry,
  updatePass,
  updateStudio,
} from "./content";
import { getInstagramGallery } from "./instagram";
import {
  confirmPassCheckout,
  createPassCheckout,
  listPassSales,
} from "./passes";
import { createFixedWindowRateLimiter, RateLimitError } from "./rateLimit";
import {
  cancelStripeCheckout,
  createStripeCheckout,
  fulfillCheckoutSession,
} from "./stripe";

const TEN_MINUTES = 10 * 60 * 1000;
const limiters = {
  day: createFixedWindowRateLimiter({ limit: 240, windowMs: TEN_MINUTES }),
  quote: createFixedWindowRateLimiter({ limit: 90, windowMs: TEN_MINUTES }),
  checkout: createFixedWindowRateLimiter({ limit: 8, windowMs: TEN_MINUTES }),
  checkoutStatus: createFixedWindowRateLimiter({
    limit: 30,
    windowMs: TEN_MINUTES,
  }),
  adminLogin: createFixedWindowRateLimiter({
    limit: 5,
    windowMs: 15 * 60 * 1000,
  }),
  adminLoginGlobal: createFixedWindowRateLimiter({
    limit: 30,
    windowMs: 15 * 60 * 1000,
  }),
};

const trpcCodes: Record<BookingErrorCode, TRPCError["code"]> = {
  BAD_REQUEST: "BAD_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PRECONDITION_FAILED: "PRECONDITION_FAILED",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
};

function clientKey(req: {
  ip?: string;
  socket?: { remoteAddress?: string };
}): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/** Maps domain errors to tRPC errors and hides unexpected failures. */
async function run<T>(action: () => Promise<T> | T): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (error instanceof RateLimitError) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many requests. Try again in ${error.retryAfterSeconds} seconds.`,
      });
    }
    if (error instanceof BookingError) {
      throw new TRPCError({
        code: trpcCodes[error.code],
        message: error.message,
      });
    }
    const pgError = error as { code?: string; message?: string };
    if (pgError?.code === "23514" || pgError?.code === "23503") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Some values are not valid.",
      });
    }
    console.error("Request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "The service is temporarily unavailable.",
    });
  }
}

// ---------------------------------------------------------------------------
// Shared input schemas
// ---------------------------------------------------------------------------

const id = z.number().int().positive();
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const startTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const endTime = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/);
const studioIds = z.array(id).min(1).max(2);
const audience = z.enum(["private", "group"]);

/** Optional text: trims, and turns an empty string into null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform(value => (value ? value : null));

const imageUrl = optionalText(500).refine(
  value => value === null || /^(https:\/\/|\/)/.test(value),
  "Use an https:// address."
);
const httpsUrl = optionalText(500).refine(
  value => value === null || /^https:\/\//.test(value),
  "Use an https:// address."
);

const rentalItems = z
  .array(
    z
      .object({
        studioIds,
        audience,
        date: dateKey,
        startTime,
        endTime,
        weeks: z.number().int().min(1).max(MAX_REPEAT_WEEKS),
      })
      .strict()
  )
  .min(1)
  .max(MAX_CART_ITEMS);

const classInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    style: z.string().trim().min(1).max(60),
    level: z.enum(["beginner", "intermediate", "advanced", "open"]),
    instructorName: optionalText(120),
    instructorInstagram: optionalText(31)
      .transform(value => (value ? value.replace(/^@/, "") : null))
      .refine(
        value => value === null || /^[A-Za-z0-9._]{1,30}$/.test(value),
        "Use an Instagram username."
      ),
    instructorImageUrl: imageUrl,
    studioId: id.nullable(),
    dayOfWeek: z.number().int().min(0).max(6),
    startTime,
    durationMinutes: z.number().int().min(15).max(480),
    startsOn: dateKey.nullable(),
    endsOn: dateKey.nullable(),
    isActive: z.boolean(),
  })
  .strict();

const passInput = z
  .object({
    category: z.enum(["classes", "rehearsal"]),
    nameEn: z.string().trim().min(1).max(80),
    nameFr: optionalText(80),
    nameEs: optionalText(80),
    detailsEn: optionalText(200),
    detailsFr: optionalText(200),
    detailsEs: optionalText(200),
    // Stripe can't take a payment of zero.
    priceCents: z.number().int().min(1).max(1_000_000),
    currency: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z]{3}$/),
    requiresClass: z.boolean(),
    sortOrder: z.number().int().min(-1000).max(1000),
    isActive: z.boolean(),
  })
  .strict();

const checkoutSessionId = z
  .string()
  .max(255)
  .regex(/^cs_(?:test|live)_[A-Za-z0-9]+$/);

const discoverSection = z.enum(["directors", "dancers", "teams", "awards"]);

const entryInput = z
  .object({
    section: discoverSection,
    name: z.string().trim().min(1).max(160),
    subtitleEn: optionalText(160),
    subtitleFr: optionalText(160),
    subtitleEs: optionalText(160),
    bodyEn: optionalText(4000),
    bodyFr: optionalText(4000),
    bodyEs: optionalText(4000),
    imageUrl,
    linkUrl: httpsUrl,
    year: z.number().int().min(1900).max(2100).nullable(),
    sortOrder: z.number().int().min(-1000).max(1000),
    isPublished: z.boolean(),
  })
  .strict();

const studioInput = z
  .object({
    capacity: z.number().int().min(1).max(1000).nullable(),
    size: optionalText(60),
    hourlyRate: z.number().int().min(0).max(1_000_000),
    groupHourlyRate: z.number().int().min(0).max(1_000_000),
    imageUrl,
    isActive: z.boolean(),
    hours: z
      .array(
        z
          .object({
            dayOfWeek: z.number().int().min(0).max(6),
            startTime,
            endTime,
          })
          .strict()
      )
      .max(28),
  })
  .strict();

const bookingStatus = z.enum(["pending", "confirmed", "cancelled"]);

const adminBookingFields = {
  date: dateKey,
  startTime,
  endTime,
  status: bookingStatus,
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z
    .string()
    .trim()
    .max(254)
    .refine(
      value => value === "" || z.string().email().safeParse(value).success,
      "Enter a valid email."
    )
    .optional(),
  customerPhone: optionalText(40).transform(value => value ?? undefined),
  notes: optionalText(1000).transform(value => value ?? undefined),
  totalCents: z.number().int().min(0).max(10_000_000).optional(),
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),

  site: router({
    classes: publicProcedure.query(() =>
      run(async () => {
        const [classes, passes] = await Promise.all([
          listPublicClasses(),
          listPublicPasses(),
        ]);
        return {
          classes: classes.map(({ isActive: _isActive, ...rest }) => rest),
          passes,
        };
      })
    ),
    discover: publicProcedure
      .input(z.object({ section: discoverSection }).strict())
      .query(({ input }) => run(() => listPublicEntries(input.section))),
    studios: publicProcedure.query(() => run(() => listPublicStudios())),
    instagram: publicProcedure.query(() => run(() => getInstagramGallery())),
  }),

  rental: router({
    day: publicProcedure
      .input(z.object({ date: dateKey }).strict())
      .query(({ input, ctx }) =>
        run(() => {
          limiters.day.consume(clientKey(ctx.req));
          return getRentalDay(input.date, ENV.stripeCurrency);
        })
      ),
    quote: publicProcedure
      .input(z.object({ items: rentalItems }).strict())
      .query(({ input, ctx }) =>
        run(() => {
          limiters.quote.consume(clientKey(ctx.req));
          return quoteOrder({ ...input, currency: ENV.stripeCurrency });
        })
      ),
    checkout: publicProcedure
      .input(
        z
          .object({
            items: rentalItems,
            customerName: z.string().trim().min(2).max(120),
            customerEmail: z.string().trim().email().max(254),
            customerPhone: optionalText(40),
            notes: optionalText(1000),
            locale: z.enum(["en", "fr", "es"]),
          })
          .strict()
      )
      .mutation(({ input, ctx }) =>
        run(() => {
          limiters.checkout.consume(clientKey(ctx.req));
          return createStripeCheckout({
            ...input,
            customerPhone: input.customerPhone ?? undefined,
            notes: input.notes ?? undefined,
          });
        })
      ),
    confirm: publicProcedure
      .input(
        z
          .object({
            sessionId: checkoutSessionId,
          })
          .strict()
      )
      .mutation(({ input, ctx }) =>
        run(() => {
          limiters.checkoutStatus.consume(clientKey(ctx.req));
          return fulfillCheckoutSession(input.sessionId);
        })
      ),
    cancel: publicProcedure
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
        run(() => {
          limiters.checkoutStatus.consume(clientKey(ctx.req));
          return cancelStripeCheckout(input);
        })
      ),
  }),

  passes: router({
    checkout: publicProcedure
      .input(
        z
          .object({
            passId: id,
            classId: id.nullable(),
            customerName: z.string().trim().min(2).max(120),
            customerEmail: z.string().trim().email().max(254),
            locale: z.enum(["en", "fr", "es"]),
          })
          .strict()
      )
      .mutation(({ input, ctx }) =>
        run(() => {
          limiters.checkout.consume(clientKey(ctx.req));
          return createPassCheckout(input);
        })
      ),
    confirm: publicProcedure
      .input(z.object({ sessionId: checkoutSessionId }).strict())
      .mutation(({ input, ctx }) =>
        run(() => {
          limiters.checkoutStatus.consume(clientKey(ctx.req));
          return confirmPassCheckout(input.sessionId);
        })
      ),
  }),

  admin: router({
    session: publicProcedure.query(({ ctx }) => ({
      authenticated: ctx.isAdmin,
      usingDefaultPassword: ctx.isAdmin && ENV.adminPasswordIsDefault,
    })),
    login: publicProcedure
      .input(z.object({ password: z.string().max(128) }).strict())
      .mutation(({ input, ctx }) =>
        run(async () => {
          // Only failed attempts count towards the limits.
          const key = clientKey(ctx.req);
          limiters.adminLogin.assertAvailable(key);
          limiters.adminLoginGlobal.assertAvailable("all");
          if (!passwordMatches(input.password)) {
            limiters.adminLogin.consume(key);
            limiters.adminLoginGlobal.consume("all");
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Incorrect password.",
            });
          }
          await startAdminSession(ctx.req, ctx.res);
          return { authenticated: true as const };
        })
      ),
    logout: publicProcedure.mutation(({ ctx }) => {
      endAdminSession(ctx.req, ctx.res);
      return { authenticated: false as const };
    }),

    bookings: router({
      list: adminProcedure
        .input(
          z
            .object({
              range: z.enum(["upcoming", "past", "all"]),
              status: bookingStatus.optional(),
              search: z.string().trim().max(120).optional(),
            })
            .strict()
        )
        .query(({ input }) => run(() => listAdminBookings(input))),
      create: adminProcedure
        .input(z.object({ studioIds, ...adminBookingFields }).strict())
        .mutation(({ input }) => run(() => createAdminBooking(input))),
      update: adminProcedure
        .input(z.object({ id, studioId: id, ...adminBookingFields }).strict())
        .mutation(({ input }) => run(() => updateAdminBooking(input))),
      remove: adminProcedure
        .input(z.object({ id }).strict())
        .mutation(({ input }) => run(() => removeAdminBooking(input.id))),
      cancelLegacy: adminProcedure
        .input(z.object({ id: z.string().uuid() }).strict())
        .mutation(({ input }) => run(() => cancelLegacyBooking(input.id))),
    }),

    classes: router({
      list: adminProcedure.query(() => run(() => listAllClasses())),
      create: adminProcedure
        .input(classInput)
        .mutation(({ input }) => run(() => createClass(input))),
      update: adminProcedure
        .input(z.object({ id, data: classInput }).strict())
        .mutation(({ input }) => run(() => updateClass(input.id, input.data))),
      remove: adminProcedure
        .input(z.object({ id }).strict())
        .mutation(({ input }) => run(() => deleteClass(input.id))),
    }),

    passes: router({
      list: adminProcedure.query(() => run(() => listAllPasses())),
      create: adminProcedure
        .input(passInput)
        .mutation(({ input }) => run(() => createPass(input))),
      update: adminProcedure
        .input(z.object({ id, data: passInput }).strict())
        .mutation(({ input }) => run(() => updatePass(input.id, input.data))),
      remove: adminProcedure
        .input(z.object({ id }).strict())
        .mutation(({ input }) => run(() => deletePass(input.id))),
    }),

    passSales: router({
      list: adminProcedure
        .input(
          z
            .object({
              status: z.enum(["paid", "all"]),
              search: z.string().max(120).optional(),
            })
            .strict()
        )
        .query(({ input }) => run(() => listPassSales(input))),
    }),

    discover: router({
      list: adminProcedure.query(() => run(() => listAllEntries())),
      create: adminProcedure
        .input(entryInput)
        .mutation(({ input }) => run(() => createEntry(input))),
      update: adminProcedure
        .input(z.object({ id, data: entryInput }).strict())
        .mutation(({ input }) => run(() => updateEntry(input.id, input.data))),
      remove: adminProcedure
        .input(z.object({ id }).strict())
        .mutation(({ input }) => run(() => deleteEntry(input.id))),
    }),

    studios: router({
      list: adminProcedure.query(() => run(() => listAdminStudios())),
      update: adminProcedure
        .input(z.object({ id, data: studioInput }).strict())
        .mutation(({ input }) => run(() => updateStudio(input.id, input.data))),
    }),
  }),
});

export type AppRouter = typeof appRouter;
