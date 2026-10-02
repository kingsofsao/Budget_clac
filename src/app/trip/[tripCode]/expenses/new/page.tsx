import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Panel } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { ExpenseForm } from "@/features/expenses/components/expense-form";
import { getTripData } from "@/features/trips/queries";
import { clampDate, todayInIndia } from "@/lib/dates";

export const metadata: Metadata = { title: "Add expense" };

export default async function NewExpensePage({
  params,
}: PageProps<"/trip/[tripCode]/expenses/new">) {
  const { tripCode } = await params;
  const data = await getTripData(tripCode);
  if (!data) return null;
  const { trip, members, me } = data;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Add expense</h1>
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
            defaultValues={{
              description: "",
              amount: "",
              paidByMemberId: me?.id ?? members[0]?.id ?? "",
              category: "other",
              splitMethod: "equal",
              expenseDate: clampDate(todayInIndia(), trip.startDate, trip.endDate),
              notes: "",
              participantIds: members.map((m) => m.id),
              customShares: {},
            }}
          />
        </Panel>
      )}
    </div>
  );
}
