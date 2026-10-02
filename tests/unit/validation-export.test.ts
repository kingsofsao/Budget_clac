import { describe, expect, it } from "vitest";
import { filterExpenses, groupByDate, parseExpenseFilters } from "@/features/expenses/filters";
import { buildTripReport } from "@/lib/calculations";
import { dayCount, eachDay, formatDateRange, isValidISODate } from "@/lib/dates";
import { buildExpensesCsv, buildSettlementText, buildSummaryText, csvCell } from "@/lib/export";
import { normaliseTripCode } from "@/lib/utils";
import { createTripSchema, memberSchema, parseExpenseForm, tripCodeSchema } from "@/lib/validation";
import type { Trip } from "@/types/domain";
import { equalExpense, makeMembers } from "./helpers";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const baseForm = {
  description: "Airport Cab",
  amount: "1,800",
  paidByMemberId: uuid(1),
  category: "transport",
  splitMethod: "equal",
  expenseDate: "2026-10-01",
  notes: "",
  participantIds: [uuid(1), uuid(2), uuid(3)],
  customShares: {},
};

describe("parseExpenseForm (shared client/server validation)", () => {
  it("parses amounts into integer paise", () => {
    const r = parseExpenseForm(baseForm);
    expect(r.ok && r.data.amountPaise).toBe(180000);
  });

  it("requires at least one participant", () => {
    const r = parseExpenseForm({ ...baseForm, participantIds: [] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.fieldErrors.participantIds).toBe("Select at least one participant.");
  });

  it("rejects zero, negative and malformed amounts", () => {
    for (const amount of ["0", "-5", "abc", "1.234", ""]) {
      const r = parseExpenseForm({ ...baseForm, amount });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.fieldErrors.amount).toBeTruthy();
    }
  });

  it("rejects custom shares that do not add up, with a helpful message", () => {
    const r = parseExpenseForm({
      ...baseForm,
      splitMethod: "custom",
      customShares: { [uuid(1)]: "400", [uuid(2)]: "300", [uuid(3)]: "300" },
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.fieldErrors.customShares).toBe(
      "The participant shares must add up to ₹1,800 (currently ₹1,000).",
    );
  });

  it("accepts exact custom shares", () => {
    const r = parseExpenseForm({
      ...baseForm,
      amount: "1000",
      splitMethod: "custom",
      customShares: { [uuid(1)]: "400", [uuid(2)]: "300", [uuid(3)]: "300.00" },
    });
    expect(r.ok).toBe(true);
    expect(r.ok && [...r.data.customShares!.values()]).toEqual([40000, 30000, 30000]);
  });

  it("rejects invalid ids, categories and dates", () => {
    expect(parseExpenseForm({ ...baseForm, paidByMemberId: "1; drop table" }).ok).toBe(false);
    expect(parseExpenseForm({ ...baseForm, category: "bribes" }).ok).toBe(false);
    expect(parseExpenseForm({ ...baseForm, expenseDate: "2026-02-30" }).ok).toBe(false);
    expect(parseExpenseForm({ ...baseForm, participantIds: [uuid(1), uuid(1)] }).ok).toBe(false);
  });
});

describe("trip, member and code schemas", () => {
  it("validates trip dates", () => {
    const ok = createTripSchema.safeParse({
      name: "Goa",
      creatorName: "S",
      startDate: "2026-10-01",
      endDate: "2026-10-01",
    });
    expect(ok.success).toBe(true);
    const bad = createTripSchema.safeParse({
      name: "Goa",
      creatorName: "S",
      startDate: "2026-10-03",
      endDate: "2026-10-01",
    });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe("End date can't be before the start date.");
  });

  it("validates member email as optional", () => {
    expect(memberSchema.safeParse({ name: "A", email: "" }).success).toBe(true);
    expect(memberSchema.safeParse({ name: "A", email: "nope" }).success).toBe(false);
    expect(memberSchema.safeParse({ name: "  " }).success).toBe(false);
  });

  it("normalises trip codes and pasted links", () => {
    expect(normaliseTripCode(" bgldemx2 ")).toBe("BGLDEMX2");
    expect(normaliseTripCode("https://example.com/trip/BGLDEMX2/balances")).toBe("BGLDEMX2");
    expect(tripCodeSchema.safeParse("bgl-demx2").success).toBe(true);
    expect(tripCodeSchema.safeParse("BGL0DEM1").success).toBe(false); // 0 and 1 are never used
  });
});

describe("dates", () => {
  it("handles ranges", () => {
    expect(dayCount("2026-10-01", "2026-10-03")).toBe(3);
    expect(eachDay("2026-12-31", "2027-01-01")).toEqual(["2026-12-31", "2027-01-01"]);
    expect(formatDateRange("2026-10-01", "2026-10-03")).toBe("01 Oct – 03 Oct");
    expect(formatDateRange("2026-10-01", "2026-10-01")).toBe("01 Oct");
    expect(isValidISODate("2028-02-29")).toBe(true);
    expect(isValidISODate("2026-02-29")).toBe(false);
  });
});

describe("filters", () => {
  const members = makeMembers(["A", "B", "C"]);
  const expenses = [
    equalExpense(180000, "m1", ["m1", "m2"], {
      description: "Airport Cab",
      category: "transport",
      date: "2026-10-01",
    }),
    equalExpense(260000, "m2", ["m1", "m2", "m3"], {
      description: "Lunch",
      category: "food",
      date: "2026-10-02",
    }),
    equalExpense(210000, "m3", ["m3"], {
      description: "Return cab",
      category: "transport",
      date: "2026-10-03",
    }),
  ];
  const f = (params: Record<string, string>) =>
    filterExpenses(expenses, parseExpenseFilters(params)).map((e) => e.description);

  it("search is case-insensitive", () =>
    expect(f({ q: "CAB" })).toEqual(["Airport Cab", "Return cab"]));
  it("filters by category", () => expect(f({ category: "food" })).toEqual(["Lunch"]));
  it("filters by payer", () => expect(f({ paidBy: "m3" })).toEqual(["Return cab"]));
  it("filters by participant", () =>
    expect(f({ participant: "m1" })).toEqual(["Airport Cab", "Lunch"]));
  it("filters by date", () => expect(f({ date: "2026-10-02" })).toEqual(["Lunch"]));
  it("filters by amount range", () =>
    expect(f({ min: "2000", max: "2,500" })).toEqual(["Return cab"]));
  it("ignores malformed filters", () =>
    expect(f({ category: "x", date: "nope", min: "abc" })).toHaveLength(3));
  it("groups by day", () => {
    expect(groupByDate(expenses).map((g) => [g.date, g.totalPaise])).toEqual([
      ["2026-10-01", 180000],
      ["2026-10-02", 260000],
      ["2026-10-03", 210000],
    ]);
  });
  void members;
});

describe("exports", () => {
  const members = makeMembers(["Surya", "Gokul"]);
  const trip: Trip = {
    id: "t",
    code: "BGLDEMX2",
    name: "Bangalore Trip",
    description: null,
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    createdBy: null,
    createdAt: "",
    updatedAt: "",
  };
  const expenses = [
    equalExpense(140000, "m1", ["m1", "m2"], { description: '=HYPERLINK("x"), "quoted"' }),
  ];
  const report = buildTripReport(trip, members, expenses);

  it("CSV escapes quotes/commas and neutralises formulas", () => {
    const csv = buildExpensesCsv(members, expenses);
    expect(csv.split("\r\n")[0]).toBe(
      "Date,Description,Category,Paid By,Participants,Amount (INR),Shares",
    );
    expect(csv).toContain(`"'=HYPERLINK(""x""), ""quoted"""`);
    expect(csv).toContain(",1400.00,");
    expect(csvCell("-1+1")).toBe("'-1+1");
  });

  it("WhatsApp settlement text has names and amounts, no payment links", () => {
    const text = buildSettlementText(trip, members, report);
    expect(text).toContain("Gokul → Surya: ₹700");
    expect(text).toContain("Total expenses: ₹1,400");
    expect(text).not.toMatch(/upi:|https?:\/\//i);
  });

  it("summary text includes per-person balances in words", () => {
    const text = buildSummaryText(trip, members, report);
    expect(text).toContain("Bangalore Trip — Final Settlement");
    expect(text).toContain("Surya: paid ₹1,400 / share ₹700 / should receive ₹700");
    expect(text).toContain("Gokul: paid ₹0 / share ₹700 / should pay ₹700");
  });
});
