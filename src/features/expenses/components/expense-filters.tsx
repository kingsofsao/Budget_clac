"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form-controls";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/categories";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface Props {
  members: { id: string; name: string }[];
  days: string[];
}

/** Filters live in the URL so results are shareable and rendered on the server. */
export function ExpenseFiltersBar({ members, days }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const advancedKeys = ["category", "paidBy", "participant", "min", "max"];
  const [open, setOpen] = useState(advancedKeys.some((k) => params.get(k)));

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const query = next.toString();
    startTransition(() =>
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }),
    );
  };

  // Debounce search typing.
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => update({ q: q.trim() || null }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const activeCount = advancedKeys.filter((k) => params.get(k)).length;

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Label htmlFor="expense-search" className="sr-only">
            Search expenses
          </Label>
          <Input
            id="expense-search"
            type="search"
            placeholder="Search expenses"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="search"
            className="pl-9"
          />
        </div>
        <Button
          variant={activeCount ? "secondary" : "outline"}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="expense-filter-panel"
        >
          <SlidersHorizontal aria-hidden="true" />
          Filters{activeCount ? ` (${activeCount})` : ""}
        </Button>
      </div>

      {days.length > 1 ? (
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
          role="group"
          aria-label="Filter by day"
        >
          {[
            { value: null, label: "All days" },
            ...days.map((d, i) => ({ value: d, label: `Day ${i + 1} · ${formatShortDate(d)}` })),
          ].map((opt) => {
            const active = (params.get("date") ?? null) === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                aria-pressed={active}
                onClick={() => update({ date: opt.value })}
                className={cn(
                  "h-9 shrink-0 rounded-full border px-3 text-sm whitespace-nowrap",
                  active
                    ? "border-primary bg-accent text-accent-foreground font-medium"
                    : "bg-card text-muted-foreground",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {open ? (
        <div
          id="expense-filter-panel"
          className="bg-card grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-category">Category</Label>
            <Select
              id="filter-category"
              value={params.get("category") ?? ""}
              onChange={(e) => update({ category: e.target.value || null })}
            >
              <option value="">All categories</option>
              {CATEGORY_IDS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIES[c].label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-paid-by">Paid by</Label>
            <Select
              id="filter-paid-by"
              value={params.get("paidBy") ?? ""}
              onChange={(e) => update({ paidBy: e.target.value || null })}
            >
              <option value="">Anyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-participant">Includes</Label>
            <Select
              id="filter-participant"
              value={params.get("participant") ?? ""}
              onChange={(e) => update({ participant: e.target.value || null })}
            >
              <option value="">Anyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <AmountFilter
            label="Min amount"
            id="filter-min"
            paramKey="min"
            initial={params.get("min") ?? ""}
            onCommit={update}
          />
          <AmountFilter
            label="Max amount"
            id="filter-max"
            paramKey="max"
            initial={params.get("max") ?? ""}
            onCommit={update}
          />
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setQ("");
                startTransition(() => router.replace(pathname, { scroll: false }));
              }}
            >
              <X aria-hidden="true" />
              Clear all filters
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AmountFilter({
  label,
  id,
  paramKey,
  initial,
  onCommit,
}: {
  label: string;
  id: string;
  paramKey: string;
  initial: string;
  onCommit: (patch: Record<string, string | null>) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label} (₹)</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onCommit({ [paramKey]: value.trim() || null })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onCommit({ [paramKey]: value.trim() || null });
          }
        }}
        placeholder="Any"
      />
    </div>
  );
}
