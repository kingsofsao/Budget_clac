import { BarChart3, Plus, ReceiptText, Scale, UserPlus } from "lucide-react";
import Link from "next/link";
import { BalanceStatusBadge, EmptyState, Panel, Section, Stat } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { ExpenseRow } from "@/features/expenses/components/expense-row";
import { ClaimMemberPrompt } from "@/features/members/components/claim-member-prompt";
import { MySettlement } from "@/features/settlements/components/my-settlement";
import { SettlementList } from "@/features/settlements/components/settlement-list";
import { ActivityFeed } from "@/features/trips/components/activity-feed";
import { getActivity, getTripData } from "@/features/trips/queries";
import { formatDateRange, dayCount } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { plural } from "@/lib/utils";

export default async function TripOverviewPage({ params }: PageProps<"/trip/[tripCode]">) {
  const { tripCode } = await params;
  const data = await getTripData(tripCode);
  if (!data) return null;
  const { trip, members, expenses, report, me } = data;
  const activity = await getActivity(trip.id, 8);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const base = `/trip/${trip.code}`;
  const myBalance = me ? report.balances.find((b) => b.memberId === me.id) : undefined;
  const days = dayCount(trip.startDate, trip.endDate);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">{trip.name} overview</h1>

      {!me && members.some((m) => !m.userId) ? (
        <ClaimMemberPrompt code={trip.code} members={members} />
      ) : null}

      <Panel>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          <Stat
            label="Total spent"
            value={formatINR(report.totals.totalPaise)}
            sub={plural(report.totals.expenseCount, "expense")}
          />
          <Stat
            label="Average share"
            value={formatINR(report.totals.averageSharePaise)}
            sub="per person"
          />
          <Stat label="People" value={members.length} />
          <Stat
            label="Dates"
            value={
              <span className="text-base sm:text-lg">
                {formatDateRange(trip.startDate, trip.endDate)}
              </span>
            }
            sub={days === 1 ? "One-day outing" : `${days} days`}
          />
        </dl>
        {myBalance ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <p className="text-sm">
              <span className="font-medium">You ({me!.name})</span>{" "}
              <span className="text-muted-foreground">
                paid {formatINR(myBalance.totalPaid)} · your share {formatINR(myBalance.totalShare)}
              </span>
            </p>
            <BalanceStatusBadge net={myBalance.net} status={myBalance.status} />
          </div>
        ) : null}
      </Panel>

      {me && expenses.length > 0 ? (
        <MySettlement code={trip.code} me={me} members={members} settlements={report.settlements} />
      ) : null}

      <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Link href={`${base}/expenses/new`} className={buttonVariants({ size: "lg" })}>
          <Plus aria-hidden="true" /> Add Expense
        </Link>
        <Link
          href={`${base}/people`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          <UserPlus aria-hidden="true" /> Add Person
        </Link>
        <Link
          href={`${base}/balances`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          <Scale aria-hidden="true" /> View Balances
        </Link>
        <Link
          href={`${base}/summary`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          <BarChart3 aria-hidden="true" /> View Summary
        </Link>
      </nav>

      {members.length < 2 ? (
        <EmptyState
          icon={UserPlus}
          title="Add the people joining this trip"
          description="Add everyone in the group, even friends who won't use the app. Names are enough."
          action={
            <Link href={`${base}/people`} className={buttonVariants()}>
              Add people
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          id="recent-expenses"
          title="Recent expenses"
          action={
            expenses.length > 0 ? (
              <Link href={`${base}/expenses`} className="text-primary text-sm font-medium">
                See all
              </Link>
            ) : null
          }
        >
          {expenses.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="No expenses yet"
              description="Start by adding the first expense."
              action={
                <Link href={`${base}/expenses/new`} className={buttonVariants()}>
                  <Plus aria-hidden="true" /> Add Expense
                </Link>
              }
            />
          ) : (
            <ul className="bg-card rounded-2xl border p-2">
              {expenses.slice(0, 5).map((e) => (
                <ExpenseRow key={e.id} expense={e} members={memberMap} code={trip.code} />
              ))}
            </ul>
          )}
        </Section>

        <Section
          id="settle-preview"
          title="Who owes whom"
          action={
            <Link href={`${base}/balances`} className="text-primary text-sm font-medium">
              Details
            </Link>
          }
        >
          <SettlementList
            settlements={report.settlements}
            members={memberMap}
            meId={me?.id}
            limit={4}
          />
        </Section>
      </div>

      <Section
        id="activity"
        title="Recent activity"
        action={
          <Link href={`${base}/activity`} className="text-primary text-sm font-medium">
            All activity
          </Link>
        }
      >
        <Panel className="py-1 sm:py-1">
          <ActivityFeed items={activity} />
        </Panel>
      </Section>
    </div>
  );
}
