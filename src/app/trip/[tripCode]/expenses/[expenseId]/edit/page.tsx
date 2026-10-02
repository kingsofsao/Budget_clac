import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Panel } from "@/components/common";
import { ExpenseForm } from "@/features/expenses/components/expense-form";
import { getTripData } from "@/features/trips/queries";
import { paiseToInputString } from "@/lib/money";

export const metadata: Metadata = { title: "Edit expense" };

export default async function EditExpensePage({
  params,
}: PageProps<"/trip/[tripCode]/expenses/[expenseId]/edit">) {
  const { tripCode, expenseId } = await params;
  const data = await getTripData(tripCode);
  if (!data) return null;
  const expense = data.expenses.find((e) => e.id === expenseId);
  if (!expense) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit expense</h1>
        <p className="text-muted-foreground">
          Saving recalculates everyone&apos;s balances and the settlement.
        </p>
      </div>
      <Panel>
        <ExpenseForm
          code={data.trip.code}
          members={data.members}
          trip={data.trip}
          expenseId={expense.id}
          defaultValues={{
            description: expense.description,
            amount: paiseToInputString(expense.amountPaise),
            paidByMemberId: expense.paidByMemberId,
            category: expense.category,
            splitMethod: expense.splitMethod,
            expenseDate: expense.expenseDate,
            notes: expense.notes ?? "",
            participantIds: expense.shares.map((s) => s.memberId),
            customShares:
              expense.splitMethod === "custom"
                ? Object.fromEntries(
                    expense.shares.map((s) => [s.memberId, paiseToInputString(s.sharePaise)]),
                  )
                : {},
          }}
        />
      </Panel>
    </div>
  );
}
