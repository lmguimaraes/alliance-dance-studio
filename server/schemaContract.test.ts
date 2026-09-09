import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("alpha schema contract", () => {
  const migration = readFileSync(resolve("drizzle/migrations/20260909_alpha_rebuild.sql"), "utf8");
  const drizzleSchema = readFileSync(resolve("drizzle/schema.ts"), "utf8");
  const html = readFileSync(resolve("client/index.html"), "utf8");

  it("uses the canonical quoted legacy timeSlots relation", () => {
    expect(migration).toContain('public."timeSlots"');
    expect(drizzleSchema).toMatch(/pgTable\s*\(\s*["']timeSlots["']/);
    expect(migration).toContain("ALTER TABLE public.%I RENAME TO \"timeSlots\"");
  });

  it("never emits unresolved Vite HTML placeholders", () => {
    expect(html).not.toContain("%VITE_");
    expect(html).toContain("<title>Alliance Dance Studio</title>");
  });
});
