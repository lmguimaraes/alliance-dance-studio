/**
 * Raw Postgres.js queries in this project bind timestamps as ISO text.
 * Explicit serialization prevents a Date object from reaching the driver's
 * string encoder after the same client has also been used by Drizzle.
 */
export function toPostgresTimestamp(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError("A valid Date is required.");
  }

  return value.toISOString();
}
