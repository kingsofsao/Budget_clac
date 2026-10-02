"use client";

import { CalendarDays, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Panel } from "@/components/common";
import { Button } from "@/components/ui/button";
import { joinTripAction } from "@/features/trips/actions";
import { formatDateRange } from "@/lib/dates";
import { GENERIC_ERROR } from "@/lib/errors";
import { plural } from "@/lib/utils";

interface Preview {
  name: string;
  startDate: string;
  endDate: string;
  memberCount: number;
}

export function JoinTripScreen({ code, preview }: { code: string; preview: Preview }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <p className="text-muted-foreground text-sm">You&apos;ve been invited to</p>
        <h1 className="text-2xl font-semibold tracking-tight">{preview.name}</h1>
      </div>
      <Panel className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm">
          <CalendarDays className="text-muted-foreground size-4" aria-hidden="true" />
          {formatDateRange(preview.startDate, preview.endDate)}
        </p>
        <p className="flex items-center gap-2 text-sm">
          <Users className="text-muted-foreground size-4" aria-hidden="true" />
          {plural(preview.memberCount, "person", "people")} on this trip
        </p>
        <p className="text-muted-foreground text-sm">
          Joining lets you see expenses and balances and add expenses for the group. No account
          needed.
        </p>
        {error ? (
          <p role="alert" className="bg-pay-bg text-pay rounded-lg p-3 text-sm">
            {error}
          </p>
        ) : null}
        <Button
          size="lg"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                const result = await joinTripAction({ code });
                if (!result.ok) setError(result.error);
                else router.refresh();
              } catch {
                setError(GENERIC_ERROR);
              }
            })
          }
        >
          {pending ? "Joining…" : "Join this trip"}
        </Button>
      </Panel>
    </div>
  );
}
