import { describe, expect, it } from "vitest";
import {
  getStudioXMembers,
  isStudioXCombination,
  normalizeStudioName,
  STUDIO_X_NAME,
  uniqueStudiosByName,
} from "./studioCatalog";

describe("studio catalog normalization", () => {
  it("normalizes whitespace and casing", () => {
    expect(normalizeStudioName("  STUDIO   6  ")).toBe("studio 6");
  });

  it("keeps the lowest ID for duplicate studio names", () => {
    const result = uniqueStudiosByName([
      { id: 7, name: "Studio 6" },
      { id: 2, name: " studio   6 " },
      { id: 3, name: "Studio 7" },
    ]);

    expect(result).toEqual([
      { id: 2, name: " studio   6 " },
      { id: 3, name: "Studio 7" },
    ]);
  });

  it("finds the two physical rooms represented by Studio X", () => {
    const members = getStudioXMembers([
      { id: 5, name: "Studio 5" },
      { id: 17, name: "STUDIO 7" },
      { id: 16, name: " Studio 6 " },
    ]);

    expect(members?.map(studio => studio.id)).toEqual([16, 17]);
    expect(STUDIO_X_NAME).toBe("Studio X");
  });

  it("recognizes only the Studio 6 and Studio 7 combination", () => {
    expect(isStudioXCombination(["Studio 7", "Studio 6"])).toBe(true);
    expect(isStudioXCombination(["Studio 5", "Studio 6"])).toBe(false);
    expect(isStudioXCombination(["Studio 6"])).toBe(false);
  });
});
