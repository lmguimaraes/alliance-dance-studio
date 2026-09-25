export type StudioIdentity = {
  id: number;
  name: string;
};

export const STUDIO_X_NAME = "Studio X";

export const STUDIO_X_DESCRIPTION =
  "Studio 6 and Studio 7 together as one connected space.";

/**
 * Treat differently cased or spaced versions of a studio name as the same
 * physical studio without changing the customer-facing value.
 */
export function normalizeStudioName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Return one deterministic row per physical studio. The lowest ID wins so
 * partially migrated environments do not show duplicate studios.
 */
export function uniqueStudiosByName<T extends StudioIdentity>(
  studios: readonly T[]
): T[] {
  const unique = new Map<string, T>();

  for (const studio of studios) {
    const normalizedName = normalizeStudioName(studio.name);
    const key = normalizedName || `studio-id:${studio.id}`;
    const current = unique.get(key);

    if (!current || studio.id < current.id) {
      unique.set(key, studio);
    }
  }

  return Array.from(unique.values()).sort((a, b) => a.id - b.id);
}

export function studioIdsKey(studioIds: readonly number[]): string {
  return Array.from(new Set(studioIds))
    .sort((a, b) => a - b)
    .join("-");
}

export function getStudioXMembers<T extends StudioIdentity>(
  studios: readonly T[]
): [T, T] | null {
  const studio6 = studios.find(
    studio => normalizeStudioName(studio.name) === "studio 6"
  );
  const studio7 = studios.find(
    studio => normalizeStudioName(studio.name) === "studio 7"
  );

  return studio6 && studio7 ? [studio6, studio7] : null;
}

export function isStudioXCombination(studioNames: readonly string[]): boolean {
  if (studioNames.length !== 2) return false;

  return (
    studioNames.map(normalizeStudioName).sort().join("|") ===
    "studio 6|studio 7"
  );
}
