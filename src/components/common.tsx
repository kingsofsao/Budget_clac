import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import type * as React from "react";
import type { BalanceStatus } from "@/lib/calculations";
import { formatINR } from "@/lib/money";
import { cn, initials } from "@/lib/utils";

export function Money({
  paise,
  className,
  signed,
}: {
  paise: number;
  className?: string;
  signed?: boolean;
}) {
  return <span className={cn("tabular", className)}>{formatINR(paise, { signed })}</span>;
}

export function MemberAvatar({
  name,
  color,
  size = "md",
  className,
}: {
  name: string;
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = { sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-12 text-sm" };
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizes[size],
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {initials(name)}
    </span>
  );
}

const statusInfo: Record<
  BalanceStatus,
  { label: string; icon: typeof ArrowDownLeft; className: string }
> = {
  receive: {
    label: "Should receive",
    icon: ArrowDownLeft,
    className: "bg-receive-bg text-receive",
  },
  pay: { label: "Should pay", icon: ArrowUpRight, className: "bg-pay-bg text-pay" },
  settled: { label: "Settled", icon: CheckCircle2, className: "bg-settled-bg text-settled" },
};

/** Plain-language balance: "Should receive ₹1,060" — never just a +/− sign. */
export function BalanceStatusBadge({
  net,
  status,
  className,
}: {
  net: number;
  status: BalanceStatus;
  className?: string;
}) {
  const info = statusInfo[status];
  const Icon = info.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        info.className,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {info.label}
      {status !== "settled" ? (
        <span className="tabular font-semibold">{formatINR(Math.abs(net))}</span>
      ) : null}
    </span>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section aria-labelledby={headingId} className={cn("flex min-w-0 flex-col gap-3", className)}>
      {title || action ? (
        <div className="flex items-end justify-between gap-3">
          <div>
            {title ? (
              <h2 id={headingId} className="text-base font-semibold">
                {title}
              </h2>
            ) : null}
            {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("bg-card rounded-2xl border p-4 sm:p-5", className)} {...props} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      <span className="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-full">
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{title}</p>
        {description ? (
          <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="tabular text-xl font-semibold sm:text-2xl">{value}</dd>
      {sub ? <dd className="text-muted-foreground text-xs">{sub}</dd> : null}
    </div>
  );
}
