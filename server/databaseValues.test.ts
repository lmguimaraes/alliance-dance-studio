import { describe, expect, it } from "vitest";
import { toPostgresTimestamp } from "./databaseValues";

describe("raw database values", () => {
  it("serializes Date values before they reach Postgres.js", () => {
    expect(
      toPostgresTimestamp(new Date("2026-09-09T16:00:00.000Z"))
    ).toBe("2026-09-09T16:00:00.000Z");
  });

  it("rejects invalid dates", () => {
    expect(() => toPostgresTimestamp(new Date("invalid"))).toThrow(
      "A valid Date is required."
    );
  });
});
