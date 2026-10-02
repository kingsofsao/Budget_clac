import { ChevronLeft, Lock, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShareButton } from "@/components/copy-button";
import { Logo } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { JoinTripScreen } from "@/features/trips/components/join-trip-screen";
import { TripNav } from "@/features/trips/components/trip-nav";
import { getTripByCode, getTripPreview } from "@/features/trips/queries";
import { formatDateRange } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { normaliseTripCode } from "@/lib/utils";

export async function generateMetadata({
  params,
}: LayoutProps<"/trip/[tripCode]">): Promise<Metadata> {
  const { tripCode } = await params;
  const access = await getTripByCode(tripCode);
  // Share links are capabilities: keep them out of search engines.
  const name = access?.trip.name ?? "Trip";
  return {
    title: { default: name, template: `%s · ${name} · Trip Split` },
    robots: { index: false, follow: false },
  };
}

export default async function TripLayout({ children, params }: LayoutProps<"/trip/[tripCode]">) {
  const { tripCode } = await params;
  const code = normaliseTripCode(tripCode);
  if (code !== tripCode) redirect(`/trip/${code}`);

  const access = await getTripByCode(code);
  if (!access) {
    const preview = await getTripPreview(code);
    return (
      <>
        <header className="bg-card border-b">
          <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
            <Link href="/" className="rounded-md">
              <Logo />
            </Link>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-md px-4 py-10">
          {preview ? (
            <JoinTripScreen code={code} preview={preview} />
          ) : (
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="bg-muted flex size-14 items-center justify-center rounded-full">
                <Lock className="size-6" aria-hidden="true" />
              </span>
              <h1 className="text-xl font-semibold">You don&apos;t have access to this trip</h1>
              <p className="text-muted-foreground">
                The trip code <span className="font-mono">{code}</span> doesn&apos;t match a trip
                you can open. Check the link, or ask a friend on the trip to share it again.
              </p>
              <Link href="/" className={buttonVariants()}>
                Go to my trips
              </Link>
            </div>
          )}
        </main>
      </>
    );
  }

  const { trip } = access;
  // Keep "Recent trips" ordering fresh. Throttled in the database.
  const supabase = await createClient();
  await supabase.rpc("touch_trip", { p_trip_id: trip.id });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-card/90 supports-[backdrop-filter]:bg-card/75 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-2 py-2 sm:px-4">
          <Link
            href="/"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="All trips"
          >
            <ChevronLeft aria-hidden="true" className="size-5!" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate leading-tight font-semibold">{trip.name}</p>
            <p className="text-muted-foreground text-xs">
              {formatDateRange(trip.startDate, trip.endDate)} · Code{" "}
              <span className="font-mono tracking-wider">{trip.code}</span>
            </p>
          </div>
          <ShareButton
            title={trip.name}
            path={`/trip/${trip.code}`}
            text={`Join "${trip.name}" on Trip Split to add expenses and see balances. Code: ${trip.code}`}
            variant="outline"
            size="sm"
          />
          <Link
            href={`/trip/${trip.code}/settings`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Trip settings"
          >
            <Settings aria-hidden="true" className="size-5!" />
          </Link>
        </div>
        <TripNav code={trip.code} variant="top" />
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 sm:pb-12">
        {children}
      </main>
      <TripNav code={trip.code} variant="bottom" />
    </div>
  );
}
