import { ArrowRight, PartyPopper } from "lucide-react";
import { EmptyState, MemberAvatar, Money } from "@/components/common";
import type { SettlementTransfer } from "@/lib/calculations";
import { cn } from "@/lib/utils";
import type { Member } from "@/types/domain";

export function SettlementList({
  settlements,
  members,
  meId,
  limit,
}: {
  settlements: SettlementTransfer[];
  members: Map<string, Member>;
  meId?: string | null;
  limit?: number;
}) {
  if (settlements.length === 0) {
    return (
      <EmptyState
        icon={PartyPopper}
        title="Everyone is currently settled"
        description="Nobody needs to pay anyone right now."
      />
    );
  }
  const shown = limit ? settlements.slice(0, limit) : settlements;
  return (
    <ol
      className="bg-card flex flex-col divide-y rounded-2xl border"
      aria-label="Suggested payments"
    >
      {shown.map((t) => {
        const from = members.get(t.fromMemberId);
        const to = members.get(t.toMemberId);
        const involvesMe = meId && (t.fromMemberId === meId || t.toMemberId === meId);
        return (
          <li
            key={`${t.fromMemberId}-${t.toMemberId}`}
            className={cn("flex items-center gap-3 px-4 py-3", involvesMe && "bg-accent/60")}
          >
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="flex min-w-0 items-center gap-2">
                <MemberAvatar name={from?.name ?? "?"} color={from?.color ?? "#6b7280"} size="sm" />
                <span className="truncate font-medium">{from?.name ?? "Removed person"}</span>
              </span>
              <span className="text-muted-foreground flex items-center gap-1 text-sm">
                <ArrowRight className="size-4" aria-hidden="true" />
                <span>pays</span>
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <MemberAvatar name={to?.name ?? "?"} color={to?.color ?? "#6b7280"} size="sm" />
                <span className="truncate font-medium">{to?.name ?? "Removed person"}</span>
              </span>
            </span>
            <Money paise={t.amountPaise} className="font-semibold" />
          </li>
        );
      })}
      {limit && settlements.length > limit ? (
        <li className="text-muted-foreground px-4 py-3 text-sm">
          + {settlements.length - limit} more
        </li>
      ) : null}
    </ol>
  );
}
