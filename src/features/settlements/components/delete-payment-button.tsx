"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { deletePaymentAction } from "@/features/settlements/actions";
import { GENERIC_ERROR } from "@/lib/errors";

export function DeletePaymentButton({
  code,
  paymentId,
  label,
}: {
  code: string;
  paymentId: string;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete payment: ${label}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 aria-hidden="true" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this recorded payment?"
        description={`“${label}” will be removed and the balances will go back to showing it as owed.`}
        confirmLabel="Delete payment"
        pendingLabel="Deleting…"
        pending={pending}
        error={error}
        onConfirm={() =>
          startTransition(async () => {
            try {
              const result = await deletePaymentAction(code, paymentId);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setOpen(false);
              toast.success("Payment deleted. Balances updated.");
              router.refresh();
            } catch {
              setError(GENERIC_ERROR);
            }
          })
        }
      />
    </>
  );
}
