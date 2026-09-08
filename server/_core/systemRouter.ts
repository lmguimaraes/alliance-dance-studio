import { z } from "zod";
import { publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z
        .object({ timestamp: z.number().nonnegative() })
        .strict()
        .optional()
    )
    .query(() => ({ ok: true as const })),
});
