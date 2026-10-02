import type { TripReport } from "@/lib/calculations";
import { CATEGORIES } from "@/lib/categories";
import { formatDateRange, formatShortDate } from "@/lib/dates";
import { formatINRPlain } from "@/lib/money";
import type { Expense, Member, Trip } from "@/types/domain";

function nameLookup(members: readonly Member[]) {
  const names = new Map(members.map((m) => [m.id, m.name]));
  return (id: string) => names.get(id) ?? "Removed person";
}

/** Short WhatsApp-friendly settlement text. Informational only — no payment links. */
export function buildSettlementText(trip: Trip, members: readonly Member[], report: TripReport) {
  const name = nameLookup(members);
  const lines = [
    `${trip.name} — Settlement`,
    "",
    `Total expenses: ${formatINRPlain(report.totals.totalPaise)}`,
    "",
  ];
  if (report.settlements.length === 0) {
    lines.push("Everyone is settled. Nobody needs to pay anyone.");
  } else {
    lines.push("Settlement:");
    for (const t of report.settlements) {
      lines.push(
        `${name(t.fromMemberId)} → ${name(t.toMemberId)}: ${formatINRPlain(t.amountPaise)}`,
      );
    }
  }
  lines.push("", "Calculated with Trip Split. Payments are settled outside the app.");
  return lines.join("\n");
}

/** Longer plain-text trip summary (copy / download). */
export function buildSummaryText(
  trip: Trip,
  members: readonly Member[],
  report: TripReport,
): string {
  const name = nameLookup(members);
  const { totals } = report;
  const lines: string[] = [
    `${trip.name} — Final Settlement`,
    formatDateRange(trip.startDate, trip.endDate),
    "",
    `Total trip spending: ${formatINRPlain(totals.totalPaise)}`,
    `${totals.expenseCount} expenses · ${totals.memberCount} people · average share ${formatINRPlain(totals.averageSharePaise)}`,
    "",
  ];

  if (report.categories.length > 0) {
    lines.push("By category:");
    for (const c of report.categories) {
      lines.push(
        `  ${CATEGORIES[c.category].label}: ${formatINRPlain(c.totalPaise)} (${c.percent}%)`,
      );
    }
    lines.push("");
  }

  lines.push("Each person (paid / share / balance):");
  for (const b of report.balances) {
    const status =
      b.net > 0
        ? `should receive ${formatINRPlain(b.net)}`
        : b.net < 0
          ? `should pay ${formatINRPlain(-b.net)}`
          : "settled";
    lines.push(
      `  ${name(b.memberId)}: paid ${formatINRPlain(b.totalPaid)} / share ${formatINRPlain(b.totalShare)} / ${status}`,
    );
  }
  lines.push("");

  if (report.settlements.length === 0) {
    lines.push("Everyone is settled.");
  } else {
    lines.push("Suggested settlement:");
    for (const t of report.settlements) {
      lines.push(
        `  ${name(t.fromMemberId)} → ${name(t.toMemberId)}: ${formatINRPlain(t.amountPaise)}`,
      );
    }
  }
  lines.push("", "This summary is informational only. No payments are processed by this app.");
  return lines.join("\n");
}

/** Escape a CSV cell per RFC 4180 and neutralise spreadsheet formula injection. */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV with Date, Description, Category, Paid By, Participants, Amount (+ shares). */
export function buildExpensesCsv(members: readonly Member[], expenses: readonly Expense[]): string {
  const name = nameLookup(members);
  const header = [
    "Date",
    "Description",
    "Category",
    "Paid By",
    "Participants",
    "Amount (INR)",
    "Shares",
  ];
  const rows = [...expenses]
    .sort((a, b) =>
      a.expenseDate === b.expenseDate
        ? a.createdAt.localeCompare(b.createdAt)
        : a.expenseDate.localeCompare(b.expenseDate),
    )
    .map((e) => [
      e.expenseDate,
      e.description,
      CATEGORIES[e.category].label,
      name(e.paidByMemberId),
      e.shares.map((s) => name(s.memberId)).join("; "),
      formatINRPlain(e.amountPaise, { noSymbol: true, alwaysShowPaise: true }).replace(/,/g, ""),
      e.shares
        .map(
          (s) =>
            `${name(s.memberId)}: ${formatINRPlain(s.sharePaise, { noSymbol: true, alwaysShowPaise: true }).replace(/,/g, "")}`,
        )
        .join("; "),
    ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function fileSafeName(name: string): string {
  return (
    name
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "trip"
  );
}

export { formatShortDate };
