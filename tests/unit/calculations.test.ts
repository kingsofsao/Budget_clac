import { describe, expect, it } from "vitest";
import {
  buildTripReport,
  calculateCategorySummary,
  calculateDailySummary,
  calculateExpenseShares,
  calculateMemberBalances,
  calculateSettlements,
  calculateTripTotals,
  checkAccountingInvariants,
  orderByMembers,
  SplitError,
  wholePercentages,
} from "@/lib/calculations";
import type { Expense, Member } from "@/types/domain";
import { customExpense, equalExpense, makeMembers, rng } from "./helpers";

const [A, B, C, D] = ["m1", "m2", "m3", "m4"] as const;
const members4 = makeMembers(["A", "B", "C", "D"]);

function report(members: Member[], expenses: Expense[]) {
  return buildTripReport({ startDate: "2026-10-01", endDate: "2026-10-03" }, members, expenses);
}
const netOf = (r: ReturnType<typeof report>, id: string) =>
  r.balances.find((b) => b.memberId === id)!.net;

describe("calculateExpenseShares", () => {
  it("simple equal split: ₹100 / 2 = ₹50 each", () => {
    expect(
      calculateExpenseShares({ method: "equal", amountPaise: 10000, participantIds: [A, B] }),
    ).toEqual([
      { memberId: A, sharePaise: 5000 },
      { memberId: B, sharePaise: 5000 },
    ]);
  });

  it("uneven remainder: ₹100 / 3 totals exactly ₹100", () => {
    const shares = calculateExpenseShares({
      method: "equal",
      amountPaise: 10000,
      participantIds: [A, B, C],
    });
    expect(shares.map((s) => s.sharePaise)).toEqual([3334, 3333, 3333]);
    expect(shares.reduce((s, x) => s + x.sharePaise, 0)).toBe(10000);
  });

  it("custom split must match the amount exactly", () => {
    const ok = calculateExpenseShares({
      method: "custom",
      amountPaise: 100000,
      shares: [
        { memberId: A, sharePaise: 40000 },
        { memberId: B, sharePaise: 30000 },
        { memberId: C, sharePaise: 30000 },
      ],
    });
    expect(ok).toHaveLength(3);
    expect(() =>
      calculateExpenseShares({
        method: "custom",
        amountPaise: 100000,
        shares: [
          { memberId: A, sharePaise: 40000 },
          { memberId: B, sharePaise: 30000 },
        ],
      }),
    ).toThrow(/must add up to ₹1,000 \(currently ₹700\)/);
  });

  it("drops zero shares in custom splits", () => {
    const shares = calculateExpenseShares({
      method: "custom",
      amountPaise: 500,
      shares: [
        { memberId: A, sharePaise: 500 },
        { memberId: B, sharePaise: 0 },
      ],
    });
    expect(shares).toEqual([{ memberId: A, sharePaise: 500 }]);
  });

  it("rejects no participants, duplicates, negatives and non-positive amounts", () => {
    expect(() =>
      calculateExpenseShares({ method: "equal", amountPaise: 100, participantIds: [] }),
    ).toThrow(SplitError);
    expect(() =>
      calculateExpenseShares({ method: "equal", amountPaise: 100, participantIds: [A, A] }),
    ).toThrow(SplitError);
    expect(() =>
      calculateExpenseShares({ method: "equal", amountPaise: 0, participantIds: [A] }),
    ).toThrow(SplitError);
    expect(() =>
      calculateExpenseShares({
        method: "custom",
        amountPaise: 100,
        shares: [
          { memberId: A, sharePaise: 200 },
          { memberId: B, sharePaise: -100 },
        ],
      }),
    ).toThrow(SplitError);
  });

  it("rounding is deterministic by trip member order, regardless of selection order", () => {
    const ordered = orderByMembers([C, A, B], members4);
    expect(ordered).toEqual([A, B, C]);
    const shares = calculateExpenseShares({
      method: "equal",
      amountPaise: 100,
      participantIds: ordered,
    });
    expect(shares.find((s) => s.memberId === A)!.sharePaise).toBe(34);
  });
});

describe("calculateMemberBalances", () => {
  it("multiple expenses accumulate correctly", () => {
    const expenses = [equalExpense(30000, A, [A, B, C]), equalExpense(60000, B, [A, B, C])];
    const r = report(members4.slice(0, 3), expenses);
    // Each owes 10000 + 20000 = 30000. A paid 30000, B paid 60000, C paid 0.
    expect(r.balances.map((b) => [b.memberId, b.totalPaid, b.totalShare, b.net])).toEqual([
      [A, 30000, 30000, 0],
      [B, 60000, 30000, 30000],
      [C, 0, 30000, -30000],
    ]);
  });

  it("person pays but does not participate: share stays zero, gets the full amount back", () => {
    const r = report(members4, [equalExpense(90000, A, [B, C, D])]);
    const a = r.balances.find((b) => b.memberId === A)!;
    expect(a.totalShare).toBe(0);
    expect(a.net).toBe(90000);
    expect(a.status).toBe("receive");
  });

  it("person participates but does not pay: owes their share", () => {
    const r = report(members4, [equalExpense(40000, A, [A, B, C, D])]);
    const d = r.balances.find((b) => b.memberId === D)!;
    expect(d.totalPaid).toBe(0);
    expect(d.totalShare).toBe(10000);
    expect(d.net).toBe(-10000);
    expect(d.status).toBe("pay");
  });

  it("everyone pays equally → all settled, no transfers", () => {
    const all = [A, B, C, D];
    const expenses = all.map((p) => equalExpense(40000, p, all));
    const r = report(members4, expenses);
    expect(r.balances.every((b) => b.net === 0 && b.status === "settled")).toBe(true);
    expect(r.settlements).toEqual([]);
  });

  it("members with no expenses appear as settled", () => {
    const r = report(members4, [equalExpense(1000, A, [A, B])]);
    expect(r.balances.find((b) => b.memberId === D)).toMatchObject({
      totalPaid: 0,
      totalShare: 0,
      net: 0,
      status: "settled",
    });
  });

  it("deleted expense: balances update when it is removed", () => {
    const e1 = equalExpense(30000, A, [A, B, C]);
    const e2 = equalExpense(12000, C, [A, B, C]);
    const before = report(members4.slice(0, 3), [e1, e2]);
    expect(netOf(before, A)).toBe(30000 - 10000 - 4000);
    const after = report(members4.slice(0, 3), [e1]);
    expect(netOf(after, A)).toBe(20000);
    expect(netOf(after, C)).toBe(-10000);
    expect(after.totals.totalPaise).toBe(30000);
  });

  it("edited expense: balances update with the new amount / participants", () => {
    const original = equalExpense(30000, A, [A, B, C]);
    const edited: Expense = {
      ...original,
      amountPaise: 40000,
      shares: calculateExpenseShares({
        method: "equal",
        amountPaise: 40000,
        participantIds: [A, B],
      }),
    };
    const r = report(members4.slice(0, 3), [edited]);
    expect(netOf(r, A)).toBe(20000);
    expect(netOf(r, B)).toBe(-20000);
    expect(netOf(r, C)).toBe(0);
  });

  it("custom split balances", () => {
    const r = report(members4.slice(0, 3), [
      customExpense(100000, A, { [A]: 40000, [B]: 30000, [C]: 30000 }),
    ]);
    expect(netOf(r, A)).toBe(60000);
    expect(netOf(r, B)).toBe(-30000);
    expect(netOf(r, C)).toBe(-30000);
  });
});

describe("calculateSettlements", () => {
  it("matches the documented example: A +1000, B +500, C −800, D −700", () => {
    const transfers = calculateSettlements(
      [
        { memberId: A, net: 100000 },
        { memberId: B, net: 50000 },
        { memberId: C, net: -80000 },
        { memberId: D, net: -70000 },
      ],
      [A, B, C, D],
    );
    // Same three transfers as the spec's example. After C→A, A still needs ₹200
    // and B ₹500, so the greedy step settles the larger creditor (B) first.
    expect(transfers).toEqual([
      { fromMemberId: C, toMemberId: A, amountPaise: 80000 },
      { fromMemberId: D, toMemberId: B, amountPaise: 50000 },
      { fromMemberId: D, toMemberId: A, amountPaise: 20000 },
    ]);
  });

  it("multiple creditors, one debtor", () => {
    const t = calculateSettlements([
      { memberId: A, net: 300 },
      { memberId: B, net: 200 },
      { memberId: C, net: -500 },
    ]);
    expect(t).toEqual([
      { fromMemberId: C, toMemberId: A, amountPaise: 300 },
      { fromMemberId: C, toMemberId: B, amountPaise: 200 },
    ]);
  });

  it("multiple debtors, one creditor", () => {
    const t = calculateSettlements([
      { memberId: A, net: 900 },
      { memberId: B, net: -400 },
      { memberId: C, net: -300 },
      { memberId: D, net: -200 },
    ]);
    expect(t).toHaveLength(3);
    expect(t.every((x) => x.toMemberId === A)).toBe(true);
    expect(t.reduce((s, x) => s + x.amountPaise, 0)).toBe(900);
  });

  it("zero-balance users never appear in transfers", () => {
    const t = calculateSettlements([
      { memberId: A, net: 500 },
      { memberId: B, net: 0 },
      { memberId: C, net: -500 },
      { memberId: D, net: 0 },
    ]);
    expect(t).toEqual([{ fromMemberId: C, toMemberId: A, amountPaise: 500 }]);
    expect(
      t.some(
        (x) =>
          [B, D].includes(x.fromMemberId as typeof B) || [B, D].includes(x.toMemberId as typeof B),
      ),
    ).toBe(false);
  });

  it("is deterministic for ties (uses member order)", () => {
    const balances = [
      { memberId: D, net: -100 },
      { memberId: C, net: -100 },
      { memberId: A, net: 100 },
      { memberId: B, net: 100 },
    ];
    const t1 = calculateSettlements(balances, [A, B, C, D]);
    const t2 = calculateSettlements([...balances].reverse(), [A, B, C, D]);
    expect(t1).toEqual(t2);
    expect(t1[0]).toEqual({ fromMemberId: C, toMemberId: A, amountPaise: 100 });
  });

  it("refuses balances that do not reconcile", () => {
    expect(() =>
      calculateSettlements([
        { memberId: A, net: 100 },
        { memberId: B, net: -99 },
      ]),
    ).toThrow(/do not reconcile/);
  });

  it("uses at most (people with non-zero balance − 1) transfers", () => {
    const t = calculateSettlements([
      { memberId: A, net: 700 },
      { memberId: B, net: 300 },
      { memberId: C, net: -250 },
      { memberId: D, net: -750 },
    ]);
    expect(t.length).toBeLessThanOrEqual(3);
  });
});

describe("summaries", () => {
  it("multi-day expenses produce per-day totals including empty days", () => {
    const expenses = [
      equalExpense(130000, A, [A, B], { date: "2026-10-01" }),
      equalExpense(180000, A, [A, B], { date: "2026-10-01" }),
      equalExpense(156000, B, [A, B], { date: "2026-10-03" }),
    ];
    const days = calculateDailySummary(expenses, "2026-10-01", "2026-10-03");
    expect(days).toEqual([
      { date: "2026-10-01", dayNumber: 1, totalPaise: 310000, count: 2 },
      { date: "2026-10-02", dayNumber: 2, totalPaise: 0, count: 0 },
      { date: "2026-10-03", dayNumber: 3, totalPaise: 156000, count: 1 },
    ]);
    expect(days.reduce((s, d) => s + d.totalPaise, 0)).toBe(466000);
  });

  it("single-day trips have one day", () => {
    expect(calculateDailySummary([], "2026-10-01", "2026-10-01")).toHaveLength(1);
  });

  it("category percentages add up to exactly 100", () => {
    const expenses = [
      equalExpense(10000, A, [A], { category: "food" }),
      equalExpense(10000, A, [A], { category: "transport" }),
      equalExpense(10000, A, [A], { category: "stay" }),
    ];
    const cats = calculateCategorySummary(expenses);
    expect(cats.map((c) => c.percent).reduce((s, p) => s + p, 0)).toBe(100);
    expect(cats.map((c) => c.percent).sort()).toEqual([33, 33, 34]);
  });

  it("category totals are ordered by amount and sum to the trip total", () => {
    const expenses = [
      equalExpense(842000, A, [A], { category: "food" }),
      equalExpense(670000, A, [A], { category: "transport" }),
      equalExpense(1200000, A, [A], { category: "stay" }),
      equalExpense(420000, A, [A], { category: "tickets" }),
    ];
    const cats = calculateCategorySummary(expenses);
    expect(cats.map((c) => c.category)).toEqual(["stay", "food", "transport", "tickets"]);
    expect(cats.reduce((s, c) => s + c.totalPaise, 0)).toBe(3132000);
    expect(cats.reduce((s, c) => s + c.percent, 0)).toBe(100);
  });

  it("wholePercentages handles zeros and empty input", () => {
    expect(wholePercentages([0, 0])).toEqual([0, 0]);
    expect(wholePercentages([5, 0, 5])).toEqual([50, 0, 50]);
  });

  it("trip totals and averages", () => {
    const t = calculateTripTotals([{ amountPaise: 3267000 }], 13);
    expect(t.totalPaise).toBe(3267000);
    expect(t.averageSharePaise).toBe(251308); // ₹2,513.08 (display only)
    expect(calculateTripTotals([], 0)).toMatchObject({
      totalPaise: 0,
      averageExpensePaise: 0,
      averageSharePaise: 0,
    });
  });
});

describe("large amounts", () => {
  it("stays exact with crore-scale integer paise", () => {
    const big = 999_999_999; // ₹99,99,999.99
    const expenses = Array.from({ length: 50 }, (_, i) =>
      equalExpense(big, i % 2 ? A : B, [A, B, C]),
    );
    const r = report(members4.slice(0, 3), expenses);
    expect(r.totals.totalPaise).toBe(big * 50);
    expect(r.invariantViolations).toEqual([]);
  });
});

describe("floating-point edge cases", () => {
  it("₹0.10 + ₹0.20 split never produces fractional paise", () => {
    const expenses = [equalExpense(10, A, [A, B, C]), equalExpense(20, B, [A, B, C])];
    const r = report(members4.slice(0, 3), expenses);
    for (const b of r.balances) {
      expect(Number.isInteger(b.totalShare)).toBe(true);
      expect(Number.isInteger(b.net)).toBe(true);
    }
    expect(r.invariantViolations).toEqual([]);
  });

  it("many ₹33.33-style splits still reconcile to the paisa", () => {
    const expenses = Array.from({ length: 300 }, () => equalExpense(10000, A, [A, B, C]));
    const r = report(members4.slice(0, 3), expenses);
    expect(netOf(r, A) + netOf(r, B) + netOf(r, C)).toBe(0);
    expect(r.invariantViolations).toEqual([]);
  });
});

describe("accounting invariants (rules 1–5), randomized", () => {
  it("hold for 300 random trips", () => {
    const random = rng(20261001);
    for (let trial = 0; trial < 300; trial++) {
      const people = 1 + Math.floor(random() * 20);
      const members = makeMembers(Array.from({ length: people }, (_, i) => `P${i}`));
      const ids = members.map((m) => m.id);
      const count = Math.floor(random() * 60);
      const expenses: Expense[] = [];
      for (let i = 0; i < count; i++) {
        const amount = 1 + Math.floor(random() * 5_000_000);
        const payer = ids[Math.floor(random() * people)]!;
        const participants = ids.filter(() => random() < 0.6);
        if (participants.length === 0) participants.push(ids[0]!);
        if (random() < 0.3) {
          // random custom split that sums exactly
          const cuts = participants.map(() => random());
          const total = cuts.reduce((s, c) => s + c, 0);
          const shares: Record<string, number> = {};
          let assigned = 0;
          participants.forEach((p, k) => {
            const v =
              k === participants.length - 1
                ? amount - assigned
                : Math.floor((amount * cuts[k]!) / total);
            shares[p] = v;
            assigned += v;
          });
          expenses.push(customExpense(amount, payer, shares));
        } else {
          expenses.push(equalExpense(amount, payer, participants));
        }
      }
      const r = buildTripReport(
        { startDate: "2026-10-01", endDate: "2026-10-03" },
        members,
        expenses,
      );
      const total = expenses.reduce((s, e) => s + e.amountPaise, 0);

      // Rule 1: total paid = total expenses
      expect(r.balances.reduce((s, b) => s + b.totalPaid, 0)).toBe(total);
      // Rule 2: total shares = total expenses
      expect(r.balances.reduce((s, b) => s + b.totalShare, 0)).toBe(total);
      // Rule 3: nets sum to zero
      expect(r.balances.reduce((s, b) => s + b.net, 0)).toBe(0);
      // Rule 4: receive = pay
      const receive = r.balances.filter((b) => b.net > 0).reduce((s, b) => s + b.net, 0);
      const pay = r.balances.filter((b) => b.net < 0).reduce((s, b) => s - b.net, 0);
      expect(receive).toBe(pay);
      // Rule 5: settlements zero every balance
      const after = new Map(r.balances.map((b) => [b.memberId, b.net]));
      for (const t of r.settlements) {
        expect(t.amountPaise).toBeGreaterThan(0);
        expect(Number.isInteger(t.amountPaise)).toBe(true);
        after.set(t.fromMemberId, after.get(t.fromMemberId)! + t.amountPaise);
        after.set(t.toMemberId, after.get(t.toMemberId)! - t.amountPaise);
      }
      expect([...after.values()].every((v) => v === 0)).toBe(true);
      const nonZero = r.balances.filter((b) => b.net !== 0).length;
      expect(r.settlements.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      expect(r.invariantViolations).toEqual([]);
    }
  });

  it("checkAccountingInvariants detects a broken expense", () => {
    const members = makeMembers(["A", "B"]);
    const broken: Expense = {
      ...equalExpense(100, A, [A, B]),
      shares: [{ memberId: A, sharePaise: 60 }],
    };
    const balances = calculateMemberBalances(members, [broken]);
    const violations = checkAccountingInvariants([broken], balances, []);
    expect(violations.length).toBeGreaterThan(0);
  });
});

describe("performance", () => {
  it("computes a 20-person, 1,000-expense report quickly", () => {
    const members = makeMembers(Array.from({ length: 20 }, (_, i) => `P${i}`));
    const ids = members.map((m) => m.id);
    const random = rng(7);
    const expenses = Array.from({ length: 1000 }, (_, i) =>
      equalExpense(
        1 + Math.floor(random() * 1_000_000),
        ids[i % 20]!,
        ids
          .filter(() => random() < 0.7)
          .concat(ids[0]!)
          .filter((v, k, arr) => arr.indexOf(v) === k),
      ),
    );
    const start = performance.now();
    const r = buildTripReport(
      { startDate: "2026-10-01", endDate: "2026-10-10" },
      members,
      expenses,
    );
    const ms = performance.now() - start;
    expect(r.invariantViolations).toEqual([]);
    expect(ms).toBeLessThan(200);
  });
});
