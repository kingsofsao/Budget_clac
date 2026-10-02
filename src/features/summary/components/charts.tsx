import type { CategoryTotal, DayTotal, MemberBalance } from "@/lib/calculations";
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "@/lib/categories";
import { formatShortDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import type { Member } from "@/types/domain";

/**
 * Lightweight, dependency-free charts rendered on the server as HTML.
 *
 * Every chart is decorative for assistive tech (`aria-hidden`) and is always
 * followed by a data table with the same numbers, so nothing relies on colour
 * or on seeing the chart. Colours follow the entity (each category has a fixed
 * slot from a colour-blind-validated palette), never its rank.
 */

export const categoryColor = (id: CategoryId) => `var(--cat-${id})`;

export function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3 shrink-0 rounded-[3px]"
      style={{ background: color }}
    />
  );
}

/** 100% stacked bar of category shares, in fixed category order (keeps validated colour adjacency). */
export function CategoryShareBar({ categories }: { categories: CategoryTotal[] }) {
  const byId = new Map(categories.map((c) => [c.category, c]));
  const ordered = CATEGORY_IDS.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const total = ordered.reduce((s, c) => s + c.totalPaise, 0);
  if (total === 0) return null;
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded-[4px]">
        {ordered.map((c) => (
          <div
            key={c.category}
            title={`${CATEGORIES[c.category].label}: ${formatINR(c.totalPaise)} (${c.percent}%)`}
            style={{
              flexGrow: c.totalPaise,
              flexBasis: 0,
              background: categoryColor(c.category),
              minWidth: 2,
            }}
          />
        ))}
      </div>
      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {ordered.map((c) => (
          <li key={c.category} className="flex items-center gap-1.5">
            <Swatch color={categoryColor(c.category)} />
            {CATEGORIES[c.category].label} {c.percent}%
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Paid vs share for each person: two thin horizontal bars on one shared scale. */
export function PersonSpendingChart({
  balances,
  members,
}: {
  balances: MemberBalance[];
  members: Map<string, Member>;
}) {
  const max = Math.max(1, ...balances.flatMap((b) => [b.totalPaid, b.totalShare]));
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <ul className="text-muted-foreground flex gap-4 text-xs">
        <li className="flex items-center gap-1.5">
          <Swatch color="var(--series-paid)" /> Paid
        </li>
        <li className="flex items-center gap-1.5">
          <Swatch color="var(--series-share)" /> Share
        </li>
      </ul>
      <div className="flex flex-col gap-3">
        {balances.map((b) => {
          const name = members.get(b.memberId)?.name ?? "Removed person";
          return (
            <div
              key={b.memberId}
              className="grid grid-cols-[6.5rem_1fr] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr]"
            >
              <span className="text-muted-foreground truncate">{name}</span>
              <div className="flex flex-col gap-[2px] border-l border-[var(--chart-grid)]">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 rounded-r-[4px]"
                    style={{
                      width: pct(b.totalPaid),
                      background: "var(--series-paid)",
                      minWidth: b.totalPaid ? 2 : 0,
                    }}
                    title={`${name} paid ${formatINR(b.totalPaid)}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 rounded-r-[4px]"
                    style={{
                      width: pct(b.totalShare),
                      background: "var(--series-share)",
                      minWidth: b.totalShare ? 2 : 0,
                    }}
                    title={`${name}'s share ${formatINR(b.totalShare)}`}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Spending per trip day as columns with a direct label on each (few bars, so labels stay readable). */
export function DailySpendingChart({ days }: { days: DayTotal[] }) {
  const max = Math.max(1, ...days.map((d) => d.totalPaise));
  const showLabels = days.length <= 10;
  return (
    <div aria-hidden="true" className="overflow-x-auto">
      <div
        className="flex h-48 items-end gap-2 border-b border-[var(--chart-grid)] px-1"
        style={{ minWidth: days.length * 44 }}
      >
        {days.map((d) => (
          <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            {showLabels && d.totalPaise > 0 ? (
              <span className="text-muted-foreground tabular text-[11px] font-medium whitespace-nowrap">
                {formatINR(d.totalPaise)}
              </span>
            ) : null}
            <div
              className="w-full max-w-6 rounded-t-[4px]"
              style={{
                height: `${(d.totalPaise / max) * 80}%`,
                minHeight: d.totalPaise ? 2 : 0,
                background: "var(--series-paid)",
              }}
              title={`${d.dayNumber ? `Day ${d.dayNumber}, ` : ""}${formatShortDate(d.date)}: ${formatINR(d.totalPaise)}`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 px-1 pt-1.5" style={{ minWidth: days.length * 44 }}>
        {days.map((d) => (
          <span key={d.date} className="text-muted-foreground flex-1 text-center text-[11px]">
            {d.dayNumber ? `D${d.dayNumber}` : formatShortDate(d.date)}
          </span>
        ))}
      </div>
    </div>
  );
}
