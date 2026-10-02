import { Download, Plus, ReceiptText, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, Money } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { ExpenseFiltersBar } from "@/features/expenses/components/expense-filters";
import { ExpenseRow } from "@/features/expenses/components/expense-row";
import {
  filterExpenses,
  groupByDate,
  hasActiveFilters,
  parseExpenseFilters,
} from "@/features/expenses/filters";
import { getTripData } from "@/features/trips/queries";
import { eachDay, formatShortDate } from "@/lib/dates";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({
  params,
  searchParams,
}: PageProps<"/trip/[tripCode]/expenses">) {
  const [{ tripCode }, query] = await Promise.all([params, searchParams]);
  const data = await getTripData(tripCode);
  if (!data) return null;
  const { trip, members, expenses } = data;
  const base = `/trip/${trip.code}`;
  const filters = parseExpenseFilters(query);
  const filtered = filterExpenses(expenses, filters);
  const groups = groupByDate(filtered);
  const days = eachDay(trip.startDate, trip.endDate);
  const dayIndex = new Map(days.map((d, i) => [d, i + 1]));
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const filteredTotal = filtered.reduce((s, e) => s + e.amountPaise, 0);
  const active = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">
            {active ? (
              <>
                {plural(filtered.length, "match", "matches")} · <Money paise={filteredTotal} />
              </>
            ) : (
              <>
                {plural(expenses.length, "expense")} · <Money paise={filteredTotal} />
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {expenses.length > 0 ? (
            <a
              href={`${base}/export/expenses.csv`}
              className={buttonVariants({ variant: "outline" })}
              download
            >
              <Download aria-hidden="true" />
              Export CSV
            </a>
          ) : null}
          <Link
            href={`${base}/expenses/new`}
            className={`${buttonVariants()} hidden sm:inline-flex`}
          >
            <Plus aria-hidden="true" />
            Add Expense
          </Link>
        </div>
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No expenses yet"
          description="Start by adding the first expense."
          action={
            <Link href={`${base}/expenses/new`} className={buttonVariants()}>
              <Plus aria-hidden="true" />
              Add Expense
            </Link>
          }
        />
      ) : (
        <>
          <Suspense>
            <ExpenseFiltersBar
              members={members.map((m) => ({ id: m.id, name: m.name }))}
              days={days}
            />
          </Suspense>
          {filtered.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No matching expenses"
              description="Try a different search or clear the filters."
            />
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((g) => {
                const n = dayIndex.get(g.date);
                return (
                  <section
                    key={g.date}
                    aria-labelledby={`day-${g.date}`}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex items-baseline justify-between gap-3 px-1">
                      <h2 id={`day-${g.date}`} className="text-sm font-semibold">
                        {n && days.length > 1 ? `Day ${n} — ` : ""}
                        {formatShortDate(g.date)}
                      </h2>
                      <span className="text-muted-foreground text-sm">
                        <Money paise={g.totalPaise} />
                      </span>
                    </div>
                    <ul className="bg-card rounded-2xl border p-2">
                      {g.expenses.map((e) => (
                        <ExpenseRow
                          key={e.id}
                          expense={e}
                          members={memberMap}
                          code={trip.code}
                          showDate={false}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
