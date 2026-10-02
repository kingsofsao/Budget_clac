"use client";

import { LogOut, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { leaveTripAction, regenerateCodeAction } from "@/features/trips/actions";
import { GENERIC_ERROR } from "@/lib/errors";

/** Owner only: replace the share code so old links stop working for new people. */
export function RegenerateCodeButton({ code }: { code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        variant="outline"
        className="self-start"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <RefreshCw aria-hidden="true" />
        Get a new code
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Get a new trip code?"
        description={`The old code (${code}) and links will stop working, so nobody new can join with them. People already on the trip keep access. Share the new link with anyone still to join.`}
        confirmLabel="Get new code"
        pendingLabel="Changing…"
        destructive={false}
        pending={pending}
        error={error}
        onConfirm={() =>
          startTransition(async () => {
            try {
              const result = await regenerateCodeAction(code);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setOpen(false);
              toast.success(`New trip code: ${result.data.code}`);
              router.replace(`/trip/${result.data.code}/settings`);
            } catch {
              setError(GENERIC_ERROR);
            }
          })
        }
      />
    </>
  );
}

/** Members: remove this trip from your account (the owner deletes it instead). */
export function LeaveTripButton({ code, name }: { code: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        variant="outline"
        className="text-destructive self-start"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <LogOut aria-hidden="true" />
        Leave trip
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Leave “${name}”?`}
        description="The trip disappears from your list. Its expenses and balances stay as they are for everyone else, and you can rejoin with the trip code."
        confirmLabel="Leave trip"
        pendingLabel="Leaving…"
        pending={pending}
        error={error}
        onConfirm={() =>
          startTransition(async () => {
            try {
              const result = await leaveTripAction(code);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setOpen(false);
              toast.success("You left the trip.");
              router.replace("/");
            } catch {
              setError(GENERIC_ERROR);
            }
          })
        }
      />
    </>
  );
}
