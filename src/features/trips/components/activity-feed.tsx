import { History } from "lucide-react";
import { EmptyState } from "@/components/common";
import type { ActivityItem } from "@/features/trips/queries";
import { formatRelativeTime, formatTimestamp } from "@/lib/dates";
import { formatINR } from "@/lib/money";

function describe(a: ActivityItem): string {
  const subject = a.subject ?? "";
  const amount = a.amountPaise !== null ? formatINR(a.amountPaise) : "";
  switch (a.action) {
    case "trip_created":
      return `${a.actorName} created the trip`;
    case "trip_updated":
      return `${a.actorName} updated the trip details`;
    case "member_added":
      return `${a.actorName} added ${subject}`;
    case "member_updated":
      return `${a.actorName} updated ${subject}`;
    case "member_removed":
      return `${a.actorName} removed ${subject}`;
    case "member_claimed":
      return `${subject} joined the trip`;
    case "expense_added":
      return `${a.actorName} added “${subject}” — ${amount}`;
    case "expense_updated":
      return a.previousAmountPaise !== null
        ? `${a.actorName} edited “${subject}” — ${formatINR(a.previousAmountPaise)} → ${amount}`
        : `${a.actorName} edited “${subject}” — ${amount}`;
    case "expense_deleted":
      return `${a.actorName} deleted “${subject}” — ${amount}`;
    default:
      return `${a.actorName} made a change`;
  }
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No activity yet"
        description="Changes to this trip will show up here."
      />
    );
  }
  return (
    <ol className="flex flex-col">
      {items.map((a) => (
        <li
          key={a.id}
          className="flex items-baseline justify-between gap-3 border-b py-2.5 text-sm last:border-b-0"
        >
          <span>{describe(a)}</span>
          <time
            dateTime={a.createdAt}
            title={formatTimestamp(a.createdAt)}
            className="text-muted-foreground shrink-0 text-xs"
          >
            {formatRelativeTime(a.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
