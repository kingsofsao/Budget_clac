import { ArrowDownLeft, ArrowUpRight, PartyPopper } from "lucide-react";
import { Money } from "@/components/common";
import type { SettlementTransfer } from "@/lib/calculations";
import type { Member } from "@/types/domain";
import { RecordPaymentDialog } from "./record-payment-dialog";

/**
 * The signed-in person's own to-do list: who they should pay and who should pay
 * them, taken from the suggested settlement.
 */
export function MySettlement({
  code,
  me,
  members,
  settlements,
}: {
  code: string;
  me: Member;
  members: Member[];
  settlements: SettlementTransfer[];
}) {
  const names = new Map(members.map((m) => [m.id, m.name]));
  const memberOptions = members.map((m) => ({ id: m.id, name: m.name }));
  const toPay = settlements.filter((t) => t.fromMemberId === me.id);
  const toReceive = settlements.filter((t) => t.toMemberId === me.id);

  if (toPay.length === 0 && toReceive.length === 0) {
    return (
      <p className="bg-receive-bg text-receive flex items-center gap-2 rounded-2xl p-4 text-sm font-medium">
        <PartyPopper className="size-5 shrink-0" aria-hidden="true" />
        You&apos;re all settled up. Nobody owes you and you don&apos;t owe anyone.
      </p>
    );
  }

  return (
    <section
      aria-labelledby="my-settlement-heading"
      className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
    >
      <h2 id="my-settlement-heading" className="font-semibold">
        Your settle-up
      </h2>
      <ul className="flex flex-col gap-2">
        {toPay.map((t) => (
          <li
            key={`pay-${t.toMemberId}`}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2 text-sm">
              <ArrowUpRight className="text-pay size-4" aria-hidden="true" />
              You pay <strong>{names.get(t.toMemberId) ?? "someone"}</strong>
              <Money paise={t.amountPaise} className="font-semibold" />
            </span>
            <RecordPaymentDialog
              code={code}
              members={memberOptions}
              suggestion={t}
              triggerLabel="Mark paid"
              triggerSize="sm"
            />
          </li>
        ))}
        {toReceive.map((t) => (
          <li
            key={`get-${t.fromMemberId}`}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2 text-sm">
              <ArrowDownLeft className="text-receive size-4" aria-hidden="true" />
              <strong>{names.get(t.fromMemberId) ?? "Someone"}</strong> pays you
              <Money paise={t.amountPaise} className="font-semibold" />
            </span>
            <RecordPaymentDialog
              code={code}
              members={memberOptions}
              suggestion={t}
              triggerLabel="Got it"
              triggerSize="sm"
              triggerVariant="ghost"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
