import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/common";
import { CATEGORIES } from "@/lib/categories";
import { formatShortDate } from "@/lib/dates";
import { plural } from "@/lib/utils";
import type { Expense, Member } from "@/types/domain";

export function CategoryIcon({
  category,
  className,
}: {
  category: Expense["category"];
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl text-lg ${className ?? ""}`}
    >
      {CATEGORIES[category].emoji}
    </span>
  );
}

export function ExpenseRow({
  expense,
  members,
  code,
  showDate = true,
}: {
  expense: Expense;
  members: Map<string, Member>;
  code: string;
  showDate?: boolean;
}) {
  const payer = members.get(expense.paidByMemberId);
  return (
    <li>
      <Link
        href={`/trip/${code}/expenses/${expense.id}`}
        className="hover:bg-muted flex items-center gap-3 rounded-xl px-2 py-2.5"
      >
        <CategoryIcon category={expense.category} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{expense.description}</span>
          <span className="text-muted-foreground block truncate text-sm">
            Paid by {payer?.name ?? "someone"} · {plural(expense.shares.length, "participant")}
            {showDate ? ` · ${formatShortDate(expense.expenseDate)}` : ""}
          </span>
        </span>
        <span className="flex flex-col items-end">
          <Money paise={expense.amountPaise} className="font-semibold" />
          <span className="text-muted-foreground text-xs">
            {CATEGORIES[expense.category].label}
          </span>
        </span>
        <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      </Link>
    </li>
  );
}
