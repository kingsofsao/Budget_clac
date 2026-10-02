/**
 * Manual verification of the 13-person Bangalore example (the same data as
 * supabase/seed.sql). Run `npm run verify:demo` to print the full breakdown.
 */
import { describe, expect, it } from "vitest";
import { buildTripReport } from "@/lib/calculations";
import { formatINR } from "@/lib/money";
import { equalExpense, makeMembers } from "./helpers";

const names = [
  "Surya",
  "Nithish",
  "Gokul",
  "Vishal",
  "Arun",
  "Karthik",
  "Priya",
  "Divya",
  "Rahul",
  "Sneha",
  "Ajay",
  "Meera",
  "Vikram",
];
const members = makeMembers(names);
const id = (n: number) => `m${n}`;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => id(from + i));

const expenses = [
  equalExpense(180000, id(1), range(1, 6), { description: "Airport Cab 1", category: "transport" }),
  equalExpense(210000, id(7), range(7, 13), {
    description: "Airport Cab 2",
    category: "transport",
  }),
  equalExpense(130000, id(2), range(1, 13), { description: "Breakfast", category: "food" }),
  equalExpense(260000, id(3), range(1, 13), { description: "Lunch", category: "food" }),
  equalExpense(1200000, id(1), range(1, 13), { description: "Hotel", category: "stay" }),
  equalExpense(156000, id(4), range(1, 12), {
    description: "Museum Tickets",
    category: "tickets",
    date: "2026-10-02",
  }),
];

const report = buildTripReport(
  { startDate: "2026-10-01", endDate: "2026-10-03" },
  members,
  expenses,
);
const name = (memberId: string) => names[Number(memberId.slice(1)) - 1]!;

describe("Bangalore Trip (13 people)", () => {
  it("prints the breakdown", () => {
    const rows = report.balances.map((b) => ({
      person: name(b.memberId),
      paid: formatINR(b.totalPaid),
      share: formatINR(b.totalShare),
      balance:
        b.net > 0
          ? `should receive ${formatINR(b.net)}`
          : b.net < 0
            ? `should pay ${formatINR(-b.net)}`
            : "settled",
    }));
    console.log(`\nTotal: ${formatINR(report.totals.totalPaise)}`);
    console.table(rows);
    console.log("Suggested settlement:");
    for (const t of report.settlements)
      console.log(`  ${name(t.fromMemberId)} → ${name(t.toMemberId)}: ${formatINR(t.amountPaise)}`);
    expect(rows).toHaveLength(13);
  });

  it("totals ₹21,360 across 6 expenses", () => {
    expect(report.totals.totalPaise).toBe(2_136_000);
    expect(formatINR(report.totals.totalPaise)).toBe("₹21,360");
  });

  it("Cab 1 splits ₹300 × 6 and Cab 2 ₹300 × 7", () => {
    expect(expenses[0]!.shares.every((s) => s.sharePaise === 30000)).toBe(true);
    expect(expenses[1]!.shares.every((s) => s.sharePaise === 30000)).toBe(true);
  });

  it("Hotel ₹12,000 / 13 gives 9 people ₹923.08 and 4 people ₹923.07 (sums exactly)", () => {
    const hotel = expenses[4]!.shares.map((s) => s.sharePaise);
    expect(hotel.filter((s) => s === 92308)).toHaveLength(9);
    expect(hotel.filter((s) => s === 92307)).toHaveLength(4);
    expect(hotel.reduce((a, b) => a + b, 0)).toBe(1_200_000);
  });

  it("matches hand-calculated balances", () => {
    const net = Object.fromEntries(report.balances.map((b) => [name(b.memberId), b.net]));
    expect(net).toEqual({
      Surya: 1_214_692, // paid 13,800 − share 1,653.08
      Nithish: -35_308,
      Gokul: 94_692,
      Vishal: -9_308,
      Arun: -165_308,
      Karthik: -165_308,
      Priya: 44_692,
      Divya: -165_308,
      Rahul: -165_308,
      Sneha: -165_307,
      Ajay: -165_307,
      Meera: -165_307,
      Vikram: -152_307, // skipped the tickets
    });
  });

  it("settles with 12 transfers (3 receivers, 10 payers) and every invariant holds", () => {
    expect(report.receiverCount).toBe(3);
    expect(report.payerCount).toBe(10);
    expect(report.settlements).toHaveLength(12);
    expect(report.totalToSettlePaise).toBe(1_354_076);
    expect(report.invariantViolations).toEqual([]);
    expect(report.settlements[0]).toEqual({
      fromMemberId: id(5),
      toMemberId: id(1),
      amountPaise: 165_308,
    });
  });
});
