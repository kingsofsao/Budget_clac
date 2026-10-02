import { describe, expect, it } from "vitest";
import { expenseToFormValues } from "@/features/expenses/form-values";
import { sharesForExpense } from "@/features/expenses/split";
import {
  buildTripReport,
  calculateExpenseShares,
  calculateMemberBalances,
  SplitError,
} from "@/lib/calculations";
import { buildSettlementText, buildSummaryText } from "@/lib/export";
import { basisPointsToInputString, formatBasisPoints, parsePercent } from "@/lib/money";
import { parseExpenseForm, parseShareCount, paymentFormSchema } from "@/lib/validation";
import type { Expense, Payment, Trip } from "@/types/domain";
import { equalExpense, makeMembers, rng } from "./helpers";

const [A, B, C] = ["m1", "m2", "m3"] as const;
const members = makeMembers(["A", "B", "C"]);
const trip: Trip = {
  id: "t",
  code: "BGLDEMX2",
  name: "Goa",
  description: null,
  startDate: "2026-10-01",
  endDate: "2026-10-03",
  createdBy: null,
  createdAt: "",
  updatedAt: "",
};

let paymentCounter = 0;
function payment(from: string, to: string, amountPaise: number): Payment {
  paymentCounter += 1;
  return {
    id: `p${paymentCounter}`,
    fromMemberId: from,
    toMemberId: to,
    amountPaise,
    paidOn: "2026-10-04",
    note: null,
    createdAt: "",
  };
}

describe("percent parsing", () => {
  it.each([
    ["50", 5000],
    ["33.33", 3333],
    ["12.5", 1250],
    ["12.5%", 1250],
    ["100", 10000],
    ["0.01", 1],
    [".5", 50],
    ["0", 0],
  ])("parses %s → %d basis points", (input, bp) => expect(parsePercent(input)).toBe(bp));

  it.each(["", "abc", "100.01", "101", "-5", "1.234", "."])("rejects %j", (input) =>
    expect(parsePercent(input)).toBeNull(),
  );

  it("formats and round-trips", () => {
    expect(formatBasisPoints(3333)).toBe("33.33%");
    expect(formatBasisPoints(5000)).toBe("50%");
    expect(formatBasisPoints(1250)).toBe("12.5%");
    for (const bp of [1, 50, 1250, 3333, 10000]) {
      expect(parsePercent(basisPointsToInputString(bp))).toBe(bp);
    }
  });

  it("parses share counts", () => {
    expect(parseShareCount("2")).toBe(2);
    expect(parseShareCount(" 10 ")).toBe(10);
    for (const bad of ["0", "1.5", "-1", "", "abc", "1001"])
      expect(parseShareCount(bad)).toBeNull();
  });
});

describe("split by shares", () => {
  it("2 shares pay twice as much as 1", () => {
    const s = calculateExpenseShares({
      method: "shares",
      amountPaise: 300000,
      weights: [
        { memberId: A, value: 2 },
        { memberId: B, value: 1 },
      ],
    });
    expect(s).toEqual([
      { memberId: A, sharePaise: 200000, splitValue: 2 },
      { memberId: B, sharePaise: 100000, splitValue: 1 },
    ]);
  });

  it("rounds deterministically and sums exactly", () => {
    const s = calculateExpenseShares({
      method: "shares",
      amountPaise: 1000,
      weights: [
        { memberId: A, value: 1 },
        { memberId: B, value: 1 },
        { memberId: C, value: 1 },
      ],
    });
    expect(s.map((x) => x.sharePaise)).toEqual([334, 333, 333]);
  });

  it("rejects zero or fractional shares", () => {
    expect(() =>
      calculateExpenseShares({
        method: "shares",
        amountPaise: 100,
        weights: [{ memberId: A, value: 0 }],
      }),
    ).toThrow(SplitError);
  });
});

describe("split by percentage", () => {
  it("splits 60/40", () => {
    const s = calculateExpenseShares({
      method: "percentage",
      amountPaise: 250000,
      weights: [
        { memberId: A, value: 6000 },
        { memberId: B, value: 4000 },
      ],
    });
    expect(s.map((x) => x.sharePaise)).toEqual([150000, 100000]);
  });

  it("33.34/33.33/33.33 of ₹100 sums exactly", () => {
    const s = calculateExpenseShares({
      method: "percentage",
      amountPaise: 10000,
      weights: [
        { memberId: A, value: 3334 },
        { memberId: B, value: 3333 },
        { memberId: C, value: 3333 },
      ],
    });
    expect(s.reduce((t, x) => t + x.sharePaise, 0)).toBe(10000);
    expect(s.map((x) => x.sharePaise)).toEqual([3334, 3333, 3333]);
  });

  it("requires exactly 100%", () => {
    expect(() =>
      calculateExpenseShares({
        method: "percentage",
        amountPaise: 100,
        weights: [
          { memberId: A, value: 5000 },
          { memberId: B, value: 4000 },
        ],
      }),
    ).toThrow("Percentages must add up to 100% (currently 90%).");
  });

  it("every random weighted split sums exactly and is proportional within 1 paisa", () => {
    const random = rng(42);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(random() * 12);
      const amount = 1 + Math.floor(random() * 50_000_000);
      const weights = Array.from({ length: n }, (_, k) => ({
        memberId: `m${k}`,
        value: 1 + Math.floor(random() * 9),
      }));
      const total = weights.reduce((t, w) => t + w.value, 0);
      const s = calculateExpenseShares({ method: "shares", amountPaise: amount, weights });
      expect(s.reduce((t, x) => t + x.sharePaise, 0)).toBe(amount);
      s.forEach((x, k) => {
        // Same check the database applies: |share × W − amount × w| < W
        expect(Math.abs(x.sharePaise * total - amount * weights[k]!.value)).toBeLessThan(total);
      });
    }
  });
});

describe("form validation for new split methods", () => {
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const base = {
    description: "Hotel",
    amount: "3000",
    paidByMemberId: uuid(1),
    category: "stay",
    expenseDate: "2026-10-01",
    notes: "",
    participantIds: [uuid(1), uuid(2)],
  };

  it("parses shares", () => {
    const r = parseExpenseForm({
      ...base,
      splitMethod: "shares",
      splitInputs: { [uuid(1)]: "2", [uuid(2)]: "1" },
    });
    expect(r.ok && [...r.data.splitValues!.values()]).toEqual([2, 1]);
  });

  it("flags bad share counts per person", () => {
    const r = parseExpenseForm({
      ...base,
      splitMethod: "shares",
      splitInputs: { [uuid(1)]: "1.5", [uuid(2)]: "" },
    });
    expect(!r.ok && Object.keys(r.fieldErrors).sort()).toEqual(
      [`splitInputs.${uuid(1)}`, `splitInputs.${uuid(2)}`].sort(),
    );
  });

  it("requires percentages to total 100%", () => {
    const r = parseExpenseForm({
      ...base,
      splitMethod: "percentage",
      splitInputs: { [uuid(1)]: "60", [uuid(2)]: "30" },
    });
    expect(!r.ok && r.fieldErrors.splitInputs).toBe(
      "Percentages must add up to 100% (currently 90%).",
    );
    const ok = parseExpenseForm({
      ...base,
      splitMethod: "percentage",
      splitInputs: { [uuid(1)]: "60", [uuid(2)]: "40" },
    });
    expect(ok.ok).toBe(true);
  });

  it("server share computation matches the form preview", () => {
    const r = parseExpenseForm({
      ...base,
      splitMethod: "shares",
      splitInputs: { [uuid(2)]: "1", [uuid(1)]: "2" },
    });
    if (!r.ok) throw new Error("expected valid");
    const shareMembers = [
      { id: uuid(1), position: 1 },
      { id: uuid(2), position: 2 },
    ];
    expect(sharesForExpense(r.data, shareMembers)).toEqual([
      { memberId: uuid(1), sharePaise: 200000, splitValue: 2 },
      { memberId: uuid(2), sharePaise: 100000, splitValue: 1 },
    ]);
  });

  it("validates payment input", () => {
    expect(
      paymentFormSchema.safeParse({
        fromMemberId: uuid(1),
        toMemberId: uuid(2),
        amount: "700",
        paidOn: "2026-10-04",
      }).success,
    ).toBe(true);
    expect(
      paymentFormSchema.safeParse({
        fromMemberId: uuid(1),
        toMemberId: uuid(2),
        amount: "0",
        paidOn: "2026-10-04",
      }).success,
    ).toBe(false);
  });
});

describe("edit / duplicate round-trip", () => {
  it("restores the original inputs for every split method", () => {
    const shares = calculateExpenseShares({
      method: "percentage",
      amountPaise: 10000,
      weights: [
        { memberId: A, value: 3334 },
        { memberId: B, value: 6666 },
      ],
    });
    const expense: Expense = {
      ...equalExpense(10000, A, [A, B]),
      splitMethod: "percentage",
      shares,
    };
    const values = expenseToFormValues(expense);
    expect(values.splitInputs).toEqual({ [A]: "33.34", [B]: "66.66" });
    expect(values.amount).toBe("100");
  });
});

describe("recorded payments", () => {
  it("recording the suggested settlement settles everyone", () => {
    const expenses = [equalExpense(90000, A, [A, B, C])];
    const before = buildTripReport(trip, members, expenses);
    expect(before.settlements).toHaveLength(2);
    const payments = before.settlements.map((t) =>
      payment(t.fromMemberId, t.toMemberId, t.amountPaise),
    );
    const after = buildTripReport(trip, members, expenses, payments);
    expect(after.settlements).toEqual([]);
    expect(after.balances.every((b) => b.net === 0)).toBe(true);
    expect(after.recordedPaymentsPaise).toBe(60000);
    expect(after.invariantViolations).toEqual([]);
    // Spending figures are unaffected by repayments.
    expect(after.totals.totalPaise).toBe(90000);
    expect(after.balances.find((b) => b.memberId === A)!.totalShare).toBe(30000);
  });

  it("a partial payment reduces what is still owed", () => {
    const expenses = [equalExpense(60000, A, [A, B])]; // B owes A 300
    const r = buildTripReport(trip, members.slice(0, 2), expenses, [payment(B, A, 10000)]);
    expect(r.balances.find((b) => b.memberId === B)).toMatchObject({
      paymentsSent: 10000,
      net: -20000,
      status: "pay",
    });
    expect(r.settlements).toEqual([{ fromMemberId: B, toMemberId: A, amountPaise: 20000 }]);
  });

  it("an overpayment flips the direction", () => {
    const expenses = [equalExpense(60000, A, [A, B])];
    const r = buildTripReport(trip, members.slice(0, 2), expenses, [payment(B, A, 40000)]);
    expect(r.settlements).toEqual([{ fromMemberId: A, toMemberId: B, amountPaise: 10000 }]);
  });

  it("a payment with no expenses still balances to zero", () => {
    const balances = calculateMemberBalances(members, [], [payment(A, B, 500)]);
    expect(balances.reduce((s, b) => s + b.net, 0)).toBe(0);
  });

  it("invariants hold for random trips with random payments", () => {
    const random = rng(7);
    for (let trial = 0; trial < 200; trial++) {
      const n = 2 + Math.floor(random() * 10);
      const ms = makeMembers(Array.from({ length: n }, (_, i) => `P${i}`));
      const ids = ms.map((m) => m.id);
      const expenses = Array.from({ length: Math.floor(random() * 30) }, () =>
        equalExpense(
          1 + Math.floor(random() * 2_000_000),
          ids[Math.floor(random() * n)]!,
          ids.filter((_, k) => k === 0 || random() < 0.6),
        ),
      );
      const payments = Array.from({ length: Math.floor(random() * 8) }, () => {
        const from = Math.floor(random() * n);
        const to = (from + 1 + Math.floor(random() * (n - 1))) % n;
        return payment(ids[from]!, ids[to]!, 1 + Math.floor(random() * 500_000));
      });
      const r = buildTripReport(trip, ms, expenses, payments);
      expect(r.invariantViolations).toEqual([]);
      expect(r.balances.reduce((s, b) => s + b.net, 0)).toBe(0);
    }
  });

  it("export text lists recorded payments and what is still to settle", () => {
    const expenses = [equalExpense(60000, A, [A, B])];
    const payments = [payment(B, A, 10000)];
    const r = buildTripReport(trip, members.slice(0, 2), expenses, payments);
    const text = buildSettlementText(trip, members.slice(0, 2), r, payments);
    expect(text).toContain("Already paid (recorded by the group, not verified):");
    expect(text).toContain("B → A: ₹100 (04 Oct)");
    expect(text).toContain("Still to settle:");
    expect(text).toContain("B → A: ₹200");
    expect(buildSummaryText(trip, members.slice(0, 2), r, payments)).toContain("Still to settle:");
  });
});
