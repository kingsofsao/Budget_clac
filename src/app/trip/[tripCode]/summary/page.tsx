import { BarChart3, Download, FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { EmptyState, Money, Panel, Section, Stat } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { BalanceTable } from "@/features/balances/components/balance-table";
import { SettlementList } from "@/features/settlements/components/settlement-list";
import {
  CategoryShareBar,
  DailySpendingChart,
  PersonSpendingChart,
  Swatch,
  categoryColor,
} from "@/features/summary/components/charts";
import { getTripData } from "@/features/trips/queries";
import { CATEGORIES } from "@/lib/categories";
import { formatShortDate } from "@/lib/dates";
import { buildSettlementText, buildSummaryText } from "@/lib/export";
import { formatINR } from "@/lib/money";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Summary" };

export default async function SummaryPage({ params }: PageProps<"/trip/[tripCode]/summary">) {
  const { tripCode } = await params;
  const data = await getTripData(tripCode);
  if (!data) return null;
  const { trip, members, expenses, report, me } = data;
  const base = `/trip/${trip.code}`;
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const { totals } = report;
  const multiDay = report.days.length > 1;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trip summary</h1>
          <p className="text-muted-foreground">{trip.name}</p>
        </div>
        {expenses.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <CopyButton
              text={buildSummaryText(trip, members, report)}
              label="Copy Summary"
              successMessage="Summary copied"
              size="sm"
            />
            <a
              href={`${base}/export/summary.txt`}
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <FileText aria-hidden="true" /> Export summary
            </a>
            <a
              href={`${base}/export/expenses.csv`}
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download aria-hidden="true" /> Export CSV
            </a>
          </div>
        ) : null}
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Nothing to summarise yet"
          description="Add expenses and the breakdown by category, person and day will appear here."
          action={
            <Link href={`${base}/expenses/new`} className={buttonVariants()}>
              <Plus aria-hidden="true" /> Add Expense
            </Link>
          }
        />
      ) : (
        <>
          <Section id="overview" title="Overview">
            <Panel>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-5">
                <Stat label="Total spent" value={formatINR(totals.totalPaise)} />
                <Stat label="Expenses" value={totals.expenseCount} />
                <Stat label="People" value={totals.memberCount} />
                <Stat label="Average expense" value={formatINR(totals.averageExpensePaise)} />
                <Stat
                  label="Average share"
                  value={formatINR(totals.averageSharePaise)}
                  sub="total ÷ people"
                />
              </dl>
            </Panel>
          </Section>

          <Section id="categories" title="By category">
            <Panel className="flex flex-col gap-4">
              <CategoryShareBar categories={report.categories} />
              <table className="w-full text-sm">
                <caption className="sr-only">Spending by category</caption>
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs tracking-wide uppercase">
                    <th scope="col" className="py-2 font-medium">
                      Category
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Amount
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Share of trip
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.categories.map((c) => (
                    <tr key={c.category}>
                      <th scope="row" className="py-2 text-left font-normal">
                        <span className="flex items-center gap-2">
                          <Swatch color={categoryColor(c.category)} />
                          {CATEGORIES[c.category].label}
                          <span className="text-muted-foreground text-xs">
                            ({plural(c.count, "expense")})
                          </span>
                        </span>
                      </th>
                      <td className="py-2 text-right font-medium">
                        <Money paise={c.totalPaise} />
                      </td>
                      <td className="tabular py-2 text-right">{c.percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-muted-foreground text-xs">
                Percentages are rounded to whole numbers so they always add up to 100%.
              </p>
            </Panel>
          </Section>

          <Section
            id="people"
            title="Spending by person"
            description="Paid = money they put in. Share = their part of what they took part in."
          >
            <Panel>
              <PersonSpendingChart balances={report.balances} members={memberMap} />
            </Panel>
            <BalanceTable
              balances={report.balances}
              members={memberMap}
              meId={me?.id}
              caption="Paid, share and balance for each person"
            />
          </Section>

          {multiDay ? (
            <Section id="days" title="Spending by day">
              <Panel className="flex flex-col gap-4">
                <DailySpendingChart days={report.days} />
                <table className="w-full text-sm">
                  <caption className="sr-only">Spending per day</caption>
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs tracking-wide uppercase">
                      <th scope="col" className="py-2 font-medium">
                        Day
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        Expenses
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.days.map((d) => (
                      <tr key={d.date}>
                        <th scope="row" className="py-2 text-left font-normal">
                          {d.dayNumber ? `Day ${d.dayNumber} — ` : ""}
                          {formatShortDate(d.date)}
                        </th>
                        <td className="tabular py-2 text-right">{d.count}</td>
                        <td className="py-2 text-right font-medium">
                          <Money paise={d.totalPaise} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <th scope="row" className="py-2 text-left">
                        Whole trip
                      </th>
                      <td className="tabular py-2 text-right">{totals.expenseCount}</td>
                      <td className="py-2 text-right">
                        <Money paise={totals.totalPaise} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </Panel>
            </Section>
          ) : null}

          <Section
            id="settlement"
            title="Settlement summary"
            action={
              report.settlements.length > 0 ? (
                <CopyButton
                  text={buildSettlementText(trip, members, report)}
                  label="Copy Settlement"
                  successMessage="Settlement copied"
                  size="sm"
                />
              ) : null
            }
          >
            <Panel>
              <p className="text-sm">
                Total to settle:{" "}
                <strong>
                  <Money paise={report.totalToSettlePaise} />
                </strong>{" "}
                · {plural(report.receiverCount, "person", "people")} should receive money ·{" "}
                {plural(report.payerCount, "person", "people")} need to pay.
              </p>
            </Panel>
            <SettlementList settlements={report.settlements} members={memberMap} meId={me?.id} />
            <p className="text-muted-foreground text-xs">
              Informational only. Trip Split doesn&apos;t process payments or check whether anyone
              has paid.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
