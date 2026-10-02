import { CalendarDays, Plus, ReceiptText, Scale, Users } from "lucide-react";
import Link from "next/link";
import { Money, Panel } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { JoinTripForm } from "@/features/trips/components/join-trip-form";
import { listMyTrips } from "@/features/trips/queries";
import { formatDateRange, formatRelativeTime, todayInIndia } from "@/lib/dates";
import { plural } from "@/lib/utils";

function tripStatus(start: string, end: string) {
  const today = todayInIndia();
  if (today < start) return { label: "Upcoming", className: "bg-accent text-accent-foreground" };
  if (today > end) return { label: "Completed", className: "bg-settled-bg text-settled" };
  return { label: "Ongoing", className: "bg-receive-bg text-receive" };
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const [trips, params] = await Promise.all([listMyTrips(), searchParams]);
  const deleted = params.deleted === "1";

  return (
    <div className="flex flex-col gap-10">
      {deleted ? (
        <p role="status" className="bg-card rounded-xl border p-3 text-sm">
          The trip was deleted.
        </p>
      ) : null}

      <section className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-center">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            Split trip expenses without the awkward maths.
          </h1>
          <p className="text-muted-foreground max-w-prose">
            Add who paid for what and who was part of it. Trip Split works out everyone&apos;s share
            and the fewest payments needed to settle up. Payments happen outside the app.
          </p>
          <div>
            <Link href="/create" className={buttonVariants({ size: "lg" })}>
              <Plus aria-hidden="true" />
              Create a Trip
            </Link>
          </div>
        </div>
        <Panel className="flex flex-col gap-3">
          <h2 className="font-semibold">Open or join a trip</h2>
          <p className="text-muted-foreground text-sm">
            Paste the trip link or type the 8-character code a friend shared.
          </p>
          <JoinTripForm />
        </Panel>
      </section>

      <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
        <h2 id="recent-heading" className="text-lg font-semibold">
          Your trips
        </h2>
        {trips.length === 0 ? (
          <div className="bg-card grid gap-3 rounded-2xl border border-dashed p-6 sm:grid-cols-3">
            {[
              {
                icon: Users,
                title: "1. Add your group",
                text: "Just names. Nobody needs an account.",
              },
              {
                icon: ReceiptText,
                title: "2. Log expenses",
                text: "Who paid, how much, and who it was for.",
              },
              { icon: Scale, title: "3. Settle up", text: "See exactly who should pay whom." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-3">
                <span className="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-muted-foreground text-sm">{text}</p>
                </div>
              </div>
            ))}
            <p className="text-muted-foreground text-sm sm:col-span-3">
              You haven&apos;t opened any trips yet. Create one to get started.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {trips.map((t) => {
              const status = tripStatus(t.startDate, t.endDate);
              return (
                <li key={t.code}>
                  <Link
                    href={`/trip/${t.code}`}
                    className="bg-card hover:border-primary/50 flex h-full flex-col gap-3 rounded-2xl border p-4 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold">{t.name}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                      <CalendarDays className="size-4" aria-hidden="true" />
                      {formatDateRange(t.startDate, t.endDate)}
                    </p>
                    <div className="mt-auto flex items-end justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">
                        {plural(t.memberCount, "person", "people")} ·{" "}
                        {plural(t.expenseCount, "expense")}
                      </span>
                      <span className="text-right">
                        <Money paise={t.totalPaise} className="block text-base font-semibold" />
                        <span className="text-muted-foreground text-xs">
                          updated {formatRelativeTime(t.updatedAt)}
                        </span>
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
