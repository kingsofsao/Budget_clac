import { ChevronLeft, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberAvatar, Money, Panel } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { DeleteExpenseButton } from "@/features/expenses/components/delete-expense-button";
import { CategoryIcon } from "@/features/expenses/components/expense-row";
import { getTripData } from "@/features/trips/queries";
import { CATEGORIES } from "@/lib/categories";
import { formatLongDate, formatTimestamp } from "@/lib/dates";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Expense" };

export default async function ExpenseDetailPage({
  params,
}: PageProps<"/trip/[tripCode]/expenses/[expenseId]">) {
  const { tripCode, expenseId } = await params;
  const data = await getTripData(tripCode);
  if (!data) return null;
  const expense = data.expenses.find((e) => e.id === expenseId);
  if (!expense) notFound();
  const memberMap = new Map(data.members.map((m) => [m.id, m]));
  const payer = memberMap.get(expense.paidByMemberId);
  const base = `/trip/${data.trip.code}`;
  const payerShares = expense.shares.some((s) => s.memberId === expense.paidByMemberId);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link
        href={`${base}/expenses`}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        All expenses
      </Link>

      <Panel className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <CategoryIcon category={expense.category} className="size-12 text-2xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">{expense.description}</h1>
            <p className="text-muted-foreground text-sm">
              {CATEGORIES[expense.category].label} · {formatLongDate(expense.expenseDate)}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Amount
            </dt>
            <dd className="text-2xl font-semibold">
              <Money paise={expense.amountPaise} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Paid by
            </dt>
            <dd className="flex items-center gap-2 text-lg font-medium">
              {payer ? <MemberAvatar name={payer.name} color={payer.color} size="sm" /> : null}
              {payer?.name ?? "Removed person"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Split
            </dt>
            <dd>{expense.splitMethod === "equal" ? "Equally" : "Custom amounts"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Participants
            </dt>
            <dd>{plural(expense.shares.length, "person", "people")}</dd>
          </div>
        </dl>

        {!payerShares ? (
          <p className="bg-accent/60 text-accent-foreground rounded-xl p-3 text-sm">
            {payer?.name ?? "The payer"} paid but isn&apos;t sharing this expense.
          </p>
        ) : null}

        <table className="w-full text-sm">
          <caption className="mb-2 text-left font-semibold">Each person&apos;s share</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {expense.shares.map((s) => {
              const m = memberMap.get(s.memberId);
              return (
                <tr key={s.memberId}>
                  <th scope="row" className="py-2 text-left font-normal">
                    <span className="flex items-center gap-2">
                      {m ? <MemberAvatar name={m.name} color={m.color} size="sm" /> : null}
                      {m?.name ?? "Removed person"}
                    </span>
                  </th>
                  <td className="py-2 text-right font-medium">
                    <Money paise={s.sharePaise} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2">
              <th scope="row" className="py-2 text-left">
                Total
              </th>
              <td className="py-2 text-right font-semibold">
                <Money paise={expense.shares.reduce((sum, s) => sum + s.sharePaise, 0)} />
              </td>
            </tr>
          </tfoot>
        </table>

        {expense.notes ? (
          <div>
            <h2 className="text-sm font-semibold">Notes</h2>
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">{expense.notes}</p>
          </div>
        ) : null}

        <p className="text-muted-foreground text-xs">
          Added {formatTimestamp(expense.createdAt)}
          {expense.updatedAt !== expense.createdAt
            ? ` · Last updated ${formatTimestamp(expense.updatedAt)}`
            : ""}
        </p>

        <div className="flex gap-2">
          <Link
            href={`${base}/expenses/${expense.id}/edit`}
            className={buttonVariants({ className: "flex-1 sm:flex-none" })}
          >
            <Pencil aria-hidden="true" />
            Edit
          </Link>
          <DeleteExpenseButton
            code={data.trip.code}
            expenseId={expense.id}
            description={expense.description}
          />
        </div>
      </Panel>
    </div>
  );
}
