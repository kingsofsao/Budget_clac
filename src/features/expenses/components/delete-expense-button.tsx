"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { deleteExpenseAction } from "@/features/expenses/actions";
import { GENERIC_ERROR } from "@/lib/errors";

export function DeleteExpenseButton({
  code,
  expenseId,
  description,
}: {
  code: string;
  expenseId: string;
  description: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        variant="outline"
        className="text-destructive"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 aria-hidden="true" />
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this expense?"
        description={
          <>
            “{description}” will be removed. This will recalculate everyone&apos;s balances and
            settlement amounts.
          </>
        }
        confirmLabel="Delete Expense"
        pendingLabel="Deleting…"
        pending={pending}
        error={error}
        onConfirm={() =>
          startTransition(async () => {
            try {
              const result = await deleteExpenseAction(code, expenseId);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setOpen(false);
              toast.success("Expense deleted. Balances recalculated.");
              router.replace(`/trip/${code}/expenses`);
            } catch {
              setError(GENERIC_ERROR);
            }
          })
        }
      />
    </>
  );
}
