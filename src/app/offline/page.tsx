import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Offline" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <span className="bg-accent text-accent-foreground flex size-14 items-center justify-center rounded-full">
        <WifiOff className="size-7" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-muted-foreground">
        Trip pages you opened recently are still available. Adding or editing expenses needs a
        connection so everyone sees the same numbers.
      </p>
      <Link href="/" className="text-primary font-medium underline-offset-4 hover:underline">
        Try again
      </Link>
    </main>
  );
}
