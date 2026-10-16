import { describe, expect, it } from "vitest";
import {
  addItem,
  cartIntervalsFor,
  cartTotal,
  EMPTY_CART,
  findCartConflict,
  restoreCart,
  type CartItem,
} from "./cartModel";

const item = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: "a",
  spaceKey: "studio-6",
  studioIds: [6],
  spaceName: "Studio 6",
  date: "2026-10-20",
  startTime: "10:00",
  endTime: "12:00",
  weeks: 1,
  hourlyRate: 1500,
  groupHourlyRate: 2200,
  ...overrides,
});

describe("cart model", () => {
  it("prices items for the selected rental type", () => {
    const state = { audience: "private" as const, items: [item({ weeks: 3 })] };
    expect(cartTotal(state)).toBe(9000);
    expect(cartTotal({ ...state, audience: "group" })).toBe(13200);
  });

  it("detects overlaps across studios that share a room and across weeks", () => {
    const items = [item({ weeks: 2 })];
    expect(
      findCartConflict(
        items,
        item({
          id: "b",
          studioIds: [6, 7],
          date: "2026-10-27",
          startTime: "11:00",
        })
      )
    ).toMatchObject({
      date: "2026-10-27",
    });
    expect(
      findCartConflict(items, item({ id: "b", studioIds: [7] }))
    ).toBeNull();
    expect(
      findCartConflict(
        items,
        item({ id: "b", startTime: "12:00", endTime: "13:00" })
      )
    ).toBeNull();
  });

  it("refuses conflicting and oversized additions", () => {
    const first = addItem(EMPTY_CART, item());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(addItem(first.state, item({ id: "b" }))).toMatchObject({
      ok: false,
      reason: "conflict",
    });

    let state = EMPTY_CART;
    for (let index = 0; index < 6; index += 1) {
      const result = addItem(
        state,
        item({ id: String(index), date: `2026-10-${10 + index}`, weeks: 4 })
      );
      if (result.ok) state = result.state;
    }
    expect(state.items).toHaveLength(6);
    expect(addItem(state, item({ id: "x", date: "2026-11-30" }))).toMatchObject(
      { ok: false, reason: "full" }
    );
  });

  it("lists cart time for a studio and date", () => {
    expect(
      cartIntervalsFor([item({ studioIds: [6, 7] })], [7], "2026-10-20")
    ).toEqual([{ start: 600, end: 720 }]);
    expect(cartIntervalsFor([item()], [7], "2026-10-20")).toEqual([]);
  });

  it("restores only valid, upcoming items from storage", () => {
    const restored = restoreCart(
      {
        audience: "group",
        items: [
          item(),
          item({ id: "past", date: "2026-10-01" }),
          { ...item({ id: "bad" }), endTime: "09:00" },
          "garbage",
        ],
      },
      "2026-10-15"
    );
    expect(restored.audience).toBe("group");
    expect(restored.items.map(entry => entry.id)).toEqual(["a"]);
    expect(restoreCart(null, "2026-10-15")).toEqual(EMPTY_CART);
  });
});
