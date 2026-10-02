import { Users } from "lucide-react";
import type { Metadata } from "next";
import { BalanceStatusBadge, EmptyState, MemberAvatar, Panel, Section } from "@/components/common";
import { AddMemberForm } from "@/features/members/components/add-member-form";
import { MemberActions } from "@/features/members/components/member-actions";
import { InvitePanel } from "@/features/trips/components/invite-panel";
import { getTripData } from "@/features/trips/queries";
import { formatINR } from "@/lib/money";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({
  params,
  searchParams,
}: PageProps<"/trip/[tripCode]/people">) {
  const [{ tripCode }, query] = await Promise.all([params, searchParams]);
  const data = await getTripData(tripCode);
  if (!data) return null;
  const { trip, members, report, me } = data;
  const isNew = query.new === "1";
  const balances = new Map(report.balances.map((b) => [b.memberId, b]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <p className="text-muted-foreground">
          {plural(members.length, "person", "people")} on this trip
        </p>
      </div>

      <Panel className="flex flex-col gap-3">
        <h2 className="font-semibold">
          {isNew ? "Add the people joining this trip" : "Add a person"}
        </h2>
        {isNew ? (
          <p className="text-muted-foreground text-sm">
            Add everyone in the group, one at a time. Friends don&apos;t need an account. Just a
            name.
          </p>
        ) : null}
        <AddMemberForm code={trip.code} autoFocus={isNew} />
      </Panel>

      <Section id="members" title="Everyone">
        {members.length === 0 ? (
          <EmptyState icon={Users} title="Add the people joining this trip" />
        ) : (
          <ul className="bg-card flex flex-col divide-y rounded-2xl border">
            {members.map((m) => {
              const b = balances.get(m.id);
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <MemberAvatar name={m.name} color={m.color} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{m.name}</span>
                      {me?.id === m.id ? (
                        <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs">
                          You
                        </span>
                      ) : m.userId ? (
                        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                          Joined
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground truncate text-sm">
                      {m.email ? `${m.email} · ` : ""}
                      Paid {formatINR(b?.totalPaid ?? 0)} · Share {formatINR(b?.totalShare ?? 0)}
                    </p>
                  </div>
                  {b ? <BalanceStatusBadge net={b.net} status={b.status} /> : null}
                  <MemberActions
                    code={trip.code}
                    member={m}
                    isMe={me?.id === m.id}
                    canClaim={!m.userId}
                    expensesPaid={b?.expensesPaid ?? 0}
                    expensesJoined={b?.expensesJoined ?? 0}
                    hasPayments={(b?.paymentsSent ?? 0) + (b?.paymentsReceived ?? 0) > 0}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <InvitePanel trip={trip} />
    </div>
  );
}
