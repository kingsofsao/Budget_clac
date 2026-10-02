import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { Money, Panel, Section } from "@/components/common";
import { BalanceTable } from "@/features/balances/components/balance-table";
import { PaymentList } from "@/features/settlements/components/payment-list";
import { RecordPaymentDialog } from "@/features/settlements/components/record-payment-dialog";
import { SettlementList } from "@/features/settlements/components/settlement-list";
import { getTripData } from "@/features/trips/queries";
import { buildSettlementText } from "@/lib/export";
import { formatINR } from "@/lib/money";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Balances" };

export default async function BalancesPage({ params }: PageProps<"/trip/[tripCode]/balances">) {
  const { tripCode } = await params;
  const data = await getTripData(tripCode);
  if (!data) return null;
  const { trip, members, report, me, payments } = data;
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const reconciled = report.invariantViolations.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Balances</h1>
        <p className="text-muted-foreground">
          Balance = what someone paid minus their share of what they took part in.
        </p>
      </div>

      <Panel className="flex flex-col gap-4">
        <dl className="grid grid-cols-3 gap-3 text-center">
          <div>
            <dt className="text-muted-foreground text-xs">Total to settle</dt>
            <dd className="text-lg font-semibold">
              <Money paise={report.totalToSettlePaise} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Should receive</dt>
            <dd className="text-lg font-semibold">
              {plural(report.receiverCount, "person", "people")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Should pay</dt>
            <dd className="text-lg font-semibold">
              {plural(report.payerCount, "person", "people")}
            </dd>
          </div>
        </dl>
        {reconciled ? (
          <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
            <ShieldCheck className="text-receive size-4" aria-hidden="true" />
            Checked: everything paid equals every share, and all balances add up to ₹0.
          </p>
        ) : (
          <p
            role="alert"
            className="bg-pay-bg text-pay flex items-center gap-2 rounded-lg p-3 text-sm"
          >
            <AlertTriangle className="size-4" aria-hidden="true" />
            These numbers don&apos;t reconcile. Please report this. Details:{" "}
            {report.invariantViolations[0]}
          </p>
        )}
      </Panel>

      <Section
        id="settlement"
        title="Suggested settlement"
        description="The fewest payments we could find to settle everyone up. Pay each other however you like; this app doesn't move money."
        action={
          report.settlements.length > 0 ? (
            <CopyButton
              text={buildSettlementText(trip, members, report, payments)}
              label="Copy Settlement"
              successMessage="Settlement copied. Paste it in your group chat."
              size="sm"
            />
          ) : null
        }
      >
        <SettlementList
          settlements={report.settlements}
          members={memberMap}
          meId={me?.id}
          recordable={members.length > 1 ? { code: trip.code } : undefined}
        />
        {report.settlements.length > 0 ? (
          <p className="text-muted-foreground text-xs">
            Paid someone back? Tap <strong>Mark paid</strong> so everyone sees it. It&apos;s only a
            note in Trip Split: the app doesn&apos;t move money or check payments.
          </p>
        ) : null}
      </Section>

      <Section
        id="payments"
        title="Recorded payments"
        description={
          payments.length > 0
            ? `${plural(payments.length, "payment")} · ${formatINR(report.recordedPaymentsPaise)} settled so far`
            : "Payments people have already made to each other."
        }
        action={
          members.length > 1 ? (
            <RecordPaymentDialog
              code={trip.code}
              members={members.map((m) => ({ id: m.id, name: m.name }))}
              triggerSize="sm"
            />
          ) : null
        }
      >
        {payments.length > 0 ? (
          <PaymentList code={trip.code} payments={payments} members={memberMap} />
        ) : (
          <p className="text-muted-foreground bg-card rounded-2xl border border-dashed p-4 text-sm">
            No payments recorded yet.
          </p>
        )}
      </Section>

      <Section id="everyone" title="Everyone's balance">
        <BalanceTable
          balances={report.balances}
          members={memberMap}
          meId={me?.id}
          caption="Paid, share and balance for each person"
        />
      </Section>
    </div>
  );
}
