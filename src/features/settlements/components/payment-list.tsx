import { ArrowRight } from "lucide-react";
import { MemberAvatar, Money } from "@/components/common";
import { formatShortDate } from "@/lib/dates";
import type { Member, Payment } from "@/types/domain";
import { DeletePaymentButton } from "./delete-payment-button";

/** Payments members recorded by hand, newest first. Not verified by the app. */
export function PaymentList({
  code,
  payments,
  members,
}: {
  code: string;
  payments: Payment[];
  members: Map<string, Member>;
}) {
  const ordered = [...payments].reverse();
  return (
    <ul
      className="bg-card flex flex-col divide-y rounded-2xl border"
      aria-label="Recorded payments"
    >
      {ordered.map((p) => {
        const from = members.get(p.fromMemberId);
        const to = members.get(p.toMemberId);
        const label = `${from?.name ?? "Removed person"} paid ${to?.name ?? "Removed person"}`;
        return (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <MemberAvatar name={from?.name ?? "?"} color={from?.color ?? "#6b7280"} size="sm" />
                <span className="truncate font-medium">{from?.name ?? "Removed person"}</span>
                <ArrowRight className="text-muted-foreground size-4" aria-hidden="true" />
                <span className="sr-only">paid</span>
                <span className="truncate font-medium">{to?.name ?? "Removed person"}</span>
              </span>
              <span className="text-muted-foreground text-xs">
                {formatShortDate(p.paidOn)}
                {p.note ? ` · ${p.note}` : ""} · recorded, not verified
              </span>
            </span>
            <Money paise={p.amountPaise} className="font-semibold" />
            <DeletePaymentButton code={code} paymentId={p.id} label={label} />
          </li>
        );
      })}
    </ul>
  );
}
