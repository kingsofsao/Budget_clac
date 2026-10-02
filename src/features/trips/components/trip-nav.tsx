"use client";

import { BarChart3, Home, Plus, ReceiptText, Scale, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "", label: "Overview", icon: Home },
  { href: "/people", label: "People", icon: Users },
  { href: "/expenses", label: "Expenses", icon: ReceiptText },
  { href: "/balances", label: "Balances", icon: Scale },
  { href: "/summary", label: "Summary", icon: BarChart3 },
];

function isActive(pathname: string, base: string, href: string) {
  const target = base + href;
  if (href === "") return pathname === base;
  if (href === "/expenses")
    return pathname.startsWith(target) && !pathname.endsWith("/expenses/new");
  return pathname.startsWith(target);
}

/**
 * Trip navigation. "top": tab bar for tablet/desktop. "bottom": thumb-reachable
 * bar for phones with a prominent Add Expense button in the middle.
 */
export function TripNav({ code, variant }: { code: string; variant: "top" | "bottom" }) {
  const pathname = usePathname();
  const base = `/trip/${code}`;

  if (variant === "top") {
    return (
      <nav aria-label="Trip sections" className="hidden sm:block">
        <ul className="mx-auto flex max-w-5xl items-center gap-1 px-4">
          {items.map(({ href, label }) => {
            const active = isActive(pathname, base, href);
            return (
              <li key={label}>
                <Link
                  href={base + href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium",
                    active
                      ? "border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
          <li className="ml-auto py-1.5">
            <Link
              href={`${base}/expenses/new`}
              className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add expense
            </Link>
          </li>
        </ul>
      </nav>
    );
  }

  const left = items.slice(0, 2);
  const right = items.slice(2, 4);
  const renderItem = ({ href, label, icon: Icon }: (typeof items)[number]) => {
    const active = isActive(pathname, base, href);
    return (
      <li key={label} className="flex-1">
        <Link
          href={base + href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
          {label}
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label="Trip sections"
      className="pb-safe bg-card fixed inset-x-0 bottom-0 z-40 border-t sm:hidden"
    >
      <ul className="flex items-stretch">
        {left.map(renderItem)}
        <li className="flex flex-1 items-center justify-center">
          <Link
            href={`${base}/expenses/new`}
            aria-label="Add expense"
            className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-full shadow-md"
          >
            <Plus className="size-6" aria-hidden="true" />
          </Link>
        </li>
        {right.map(renderItem)}
      </ul>
    </nav>
  );
}
