import { describe, expect, it } from "vitest";
import {
  addMoney,
  formatINR,
  formatINRPlain,
  MoneyError,
  paiseToInputString,
  parseINR,
  splitByWeights,
  splitEqual,
  subtractMoney,
  sumMoney,
  validateSplit,
} from "@/lib/money";

describe("parseINR", () => {
  it.each([
    ["1800", 180000],
    ["1,800", 180000],
    ["₹1,800", 180000],
    ["₹ 1,800.50", 180050],
    ["1800.5", 180050],
    ["1800.05", 180005],
    ["0.01", 1],
    [".75", 75],
    ["18,00,000", 180000000],
    ["  42  ", 4200],
    ["Rs. 99", 9900],
    ["0", 0],
  ])("parses %s → %d paise", (input, expected) => {
    expect(parseINR(input)).toBe(expected);
  });

  it.each(["", " ", "abc", "-5", "1.234", "1.2.3", "12e3", "₹", ".", "1,8a0", "99999999999999"])(
    "rejects %j",
    (input) => {
      expect(parseINR(input)).toBeNull();
    },
  );

  it("never goes through floating point (0.1 + 0.2 style inputs)", () => {
    expect(parseINR("0.10")! + parseINR("0.20")!).toBe(30);
    expect(parseINR("1.15")).toBe(115); // 1.15 * 100 = 114.99999999999999 in floats
    expect(parseINR("4.35")).toBe(435); // 4.35 * 100 = 434.99999999999994 in floats
  });
});

describe("formatINR", () => {
  it.each([
    [180000, "₹1,800"],
    [3267000, "₹32,670"],
    [251350, "₹2,513.50"],
    [5, "₹0.05"],
    [0, "₹0"],
    [10000000000, "₹10,00,00,000"],
    [12345678, "₹1,23,456.78"],
    [-70000, "−₹700"],
  ])("%d → %s", (paise, expected) => {
    expect(formatINR(paise)).toBe(expected);
  });

  it("supports signed and plain output", () => {
    expect(formatINR(106000, { signed: true })).toBe("+₹1,060");
    expect(formatINRPlain(-70000)).toBe("-₹700");
    expect(formatINR(180000, { alwaysShowPaise: true })).toBe("₹1,800.00");
    expect(formatINR(180000, { noSymbol: true })).toBe("1,800");
  });

  it("rejects non-integer input", () => {
    expect(() => formatINR(1.5)).toThrow(MoneyError);
  });

  it("round-trips through the input string", () => {
    for (const p of [1, 99, 100, 180050, 123456789])
      expect(parseINR(paiseToInputString(p))).toBe(p);
  });
});

describe("integer arithmetic helpers", () => {
  it("adds, sums and subtracts integers only", () => {
    expect(addMoney(10, 20, 30)).toBe(60);
    expect(sumMoney([1, 2, 3])).toBe(6);
    expect(subtractMoney(100, 250)).toBe(-150);
    expect(() => addMoney(0.1, 0.2)).toThrow(MoneyError);
    expect(() => sumMoney([Number.MAX_SAFE_INTEGER, 1])).toThrow(MoneyError);
  });
});

describe("splitEqual", () => {
  it("₹100 / 2 = ₹50 each", () => {
    expect(splitEqual(10000, 2)).toEqual([5000, 5000]);
  });

  it("₹100 / 3 → 3334, 3333, 3333 (remainder to the first participant)", () => {
    expect(splitEqual(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it("100 paise / 3 → 34, 33, 33", () => {
    expect(splitEqual(100, 3)).toEqual([34, 33, 33]);
  });

  it("gives remainder paise to the first N people, deterministically", () => {
    expect(splitEqual(1200000, 13)).toEqual([
      92308, 92308, 92308, 92308, 92308, 92308, 92308, 92308, 92308, 92307, 92307, 92307, 92307,
    ]);
    expect(splitEqual(1200000, 13)).toEqual(splitEqual(1200000, 13));
  });

  it("always sums exactly to the amount", () => {
    for (let amount = 1; amount < 2000; amount += 7) {
      for (let n = 1; n <= 20; n++) {
        const parts = splitEqual(amount, n);
        expect(parts.reduce((s, p) => s + p, 0)).toBe(amount);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("handles amounts smaller than the number of people", () => {
    expect(splitEqual(2, 5)).toEqual([1, 1, 0, 0, 0]);
  });

  it("rejects zero participants", () => {
    expect(() => splitEqual(100, 0)).toThrow(MoneyError);
  });
});

describe("splitByWeights (future weighted / percentage splits)", () => {
  it("splits proportionally and sums exactly", () => {
    expect(splitByWeights(1000, [1, 2, 2])).toEqual([200, 400, 400]);
    const parts = splitByWeights(1001, [1, 1, 1]);
    expect(parts).toEqual([334, 334, 333].sort((a, b) => b - a));
    expect(parts.reduce((s, p) => s + p, 0)).toBe(1001);
  });

  it("does not overflow on large amounts", () => {
    const parts = splitByWeights(999_999_999_999, [3, 7, 11]);
    expect(parts.reduce((s, p) => s + p, 0)).toBe(999_999_999_999);
  });
});

describe("validateSplit", () => {
  it("accepts exact custom shares", () => {
    expect(validateSplit(100000, [40000, 30000, 30000])).toEqual({
      valid: true,
      total: 100000,
      remaining: 0,
    });
  });
  it("rejects shares that do not add up", () => {
    expect(validateSplit(100000, [40000, 30000, 29999])).toMatchObject({
      valid: false,
      remaining: 1,
    });
    expect(validateSplit(100000, [40000, 30000, 30001])).toMatchObject({
      valid: false,
      remaining: -1,
    });
  });
  it("rejects negative shares even if the total matches", () => {
    expect(validateSplit(100, [200, -100]).valid).toBe(false);
  });
});
