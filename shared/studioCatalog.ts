export type StudioIdentity = {
  id: number;
  name: string;
};

/**
 * Treat differently-cased / spaced versions of a studio name
 * as the same physical studio.
 */
export function normalizeStudioName(
  name: string
): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Return one deterministic record per physical studio.
 * The lowest database ID is kept.
 */
export function uniqueStudiosByName<
  T extends StudioIdentity
>(
  studios: readonly T[]
): T[] {
  const unique = new Map<string, T>();

  for (const studio of studios) {
    const normalizedName =
      normalizeStudioName(studio.name);

    const key =
      normalizedName ||
      `studio-id:${studio.id}`;

    const current = unique.get(key);

    if (!current || studio.id < current.id) {
      unique.set(key, studio);
    }
  }

  return Array.from(unique.values()).sort(
    (a, b) => a.id - b.id
  );
}