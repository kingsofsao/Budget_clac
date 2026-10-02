import { BalanceStatusBadge, MemberAvatar, Money } from "@/components/common";
import type { MemberBalance } from "@/lib/calculations";
import { cn } from "@/lib/utils";
import type { Member } from "@/types/domain";

/** Person | Paid | Share | Balance — with plain-language balance labels. */
export function BalanceTable({
  balances,
  members,
  meId,
  caption,
}: {
  balances: MemberBalance[];
  members: Map<string, Member>;
  meId?: string | null;
  caption: string;
}) {
  const totals = balances.reduce(
    (acc, b) => ({ paid: acc.paid + b.totalPaid, share: acc.share + b.totalShare }),
    { paid: 0, share: 0 },
  );
  return (
    <div className="bg-card overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs tracking-wide uppercase">
            <th scope="col" className="px-4 py-2.5 font-medium">
              Person
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Paid
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Share
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Balance
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {balances.map((b) => {
            const m = members.get(b.memberId);
            return (
              <tr key={b.memberId} className={cn(meId === b.memberId && "bg-accent/50")}>
                <th scope="row" className="px-4 py-2.5 text-left font-medium">
                  <span className="flex items-center gap-2">
                    <MemberAvatar name={m?.name ?? "?"} color={m?.color ?? "#6b7280"} size="sm" />
                    {m?.name ?? "Removed person"}
                    {meId === b.memberId ? (
                      <span className="text-muted-foreground text-xs font-normal">(you)</span>
                    ) : null}
                  </span>
                </th>
                <td className="px-4 py-2.5 text-right">
                  <Money paise={b.totalPaid} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Money paise={b.totalShare} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <BalanceStatusBadge net={b.net} status={b.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <th scope="row" className="px-4 py-2.5 text-left">
              Total
            </th>
            <td className="px-4 py-2.5 text-right">
              <Money paise={totals.paid} />
            </td>
            <td className="px-4 py-2.5 text-right">
              <Money paise={totals.share} />
            </td>
            <td className="text-muted-foreground px-4 py-2.5 text-right text-xs font-normal">
              Balances sum to ₹0
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
