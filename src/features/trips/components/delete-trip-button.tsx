"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { deleteTripAction } from "@/features/trips/actions";
import { GENERIC_ERROR } from "@/lib/errors";

export function DeleteTripButton({ code, name }: { code: string; name: string }) {
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
        <Trash2 aria-hidden="true" />
        Delete trip
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete “${name}”?`}
        description="This permanently deletes the trip, its people, every expense and the activity history for everyone in the group. This can't be undone."
        confirmLabel="Delete trip"
        pendingLabel="Deleting…"
        pending={pending}
        error={error}
        onConfirm={() =>
          startTransition(async () => {
            try {
              // On success the action redirects, so a result only comes back on failure.
              const result = await deleteTripAction(code);
              if (result && !result.ok) setError(result.error);
            } catch (err) {
              // redirect() throws a control-flow error that Next handles; anything else is a real failure.
              if (!(err instanceof Error && "digest" in err)) setError(GENERIC_ERROR);
              else throw err;
            }
          })
        }
      />
    </>
  );
}
