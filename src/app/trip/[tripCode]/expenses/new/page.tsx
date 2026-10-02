import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Panel } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { ExpenseForm } from "@/features/expenses/components/expense-form";
import { expenseToFormValues } from "@/features/expenses/form-values";
import { getTripData } from "@/features/trips/queries";
import { clampDate, todayInIndia } from "@/lib/dates";
import type { ExpenseFormValues } from "@/lib/validation";

export const metadata: Metadata = { title: "Add expense" };

export default async function NewExpensePage({
  params,
  searchParams,
}: PageProps<"/trip/[tripCode]/expenses/new">) {
  const [{ tripCode }, query] = await Promise.all([params, searchParams]);
  const data = await getTripData(tripCode);
  if (!data) return null;
  const { trip, members, me, expenses } = data;
  const defaultDate = clampDate(todayInIndia(), trip.startDate, trip.endDate);

  // "Duplicate": start from an existing expense (same amount, people and split), dated today.
  const copyId = typeof query.copy === "string" ? query.copy : null;
  const source = copyId ? expenses.find((e) => e.id === copyId) : undefined;
  const memberIds = new Set(members.map((m) => m.id));
  const defaultValues: ExpenseFormValues = source
    ? {
        ...expenseToFormValues(source),
        expenseDate: defaultDate,
        participantIds: source.shares.map((s) => s.memberId).filter((id) => memberIds.has(id)),
      }
    : {
        description: "",
        amount: "",
        paidByMemberId: me?.id ?? members[0]?.id ?? "",
        category: "other",
        splitMethod: "equal",
        expenseDate: defaultDate,
        notes: "",
        participantIds: members.map((m) => m.id),
        splitInputs: {},
      };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {source ? "Duplicate expense" : "Add expense"}
        </h1>
        {source ? (
          <p className="text-muted-foreground">
            Copied from “{source.description}”. Check the date and amount before saving.
          </p>
        ) : null}
      </div>
      {members.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Add the people joining this trip"
          description="You need at least one person before adding expenses."
          action={
            <Link href={`/trip/${trip.code}/people`} className={buttonVariants()}>
              Add people
            </Link>
          }
        />
      ) : (
        <Panel>
          <ExpenseForm
            code={trip.code}
            members={members}
            trip={trip}
            expenseId={null}
            defaultValues={defaultValues}
          />
        </Panel>
      )}
    </div>
  );
}
