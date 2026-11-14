import { describe, it, expect } from "vitest";
import { shuffledOrder } from "../../src/renderer/src/lib/shuffle";

describe("shuffledOrder", () => {
  it("shuffledOrder is a permutation", () => {
    const order = shuffledOrder("a:1", 6);
    expect([...order].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("shuffledOrder is stable for a seed", () => {
    expect(shuffledOrder("a:1", 5)).toEqual(shuffledOrder("a:1", 5));
  });

  it("shuffledOrder differs between seeds", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 10; i++) {
      orders.add(JSON.stringify(shuffledOrder(`s:${i}`, 5)));
    }
    expect(orders.size).toBeGreaterThanOrEqual(2);
  });

  it("shuffledOrder handles 0 and 1", () => {
    expect(shuffledOrder("x", 0)).toEqual([]);
    expect(shuffledOrder("x", 1)).toEqual([0]);
  });

  it("shuffledOrder does not always keep the order", () => {
    const identity = [0, 1, 2, 3];
    let differs = false;
    for (let i = 0; i < 10; i++) {
      if (JSON.stringify(shuffledOrder(`s:${i}`, 4)) !== JSON.stringify(identity)) {
        differs = true;
      }
    }
    expect(differs).toBe(true);
  });
});
