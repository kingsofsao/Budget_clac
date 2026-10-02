"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <span className="bg-pay-bg text-pay flex size-14 items-center justify-center rounded-full">
        <AlertTriangle className="size-7" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold">Something went wrong. Please try again.</h1>
      <p className="text-muted-foreground">
        Your data is safe. Nothing is saved halfway. If you have no signal, reconnect and retry.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Go home
        </Link>
      </div>
    </main>
  );
}
