"use client";

import { CheckCheck, HandCoins } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { recordPaymentAction } from "@/features/settlements/actions";
import { todayInIndia } from "@/lib/dates";
import { GENERIC_ERROR } from "@/lib/errors";
import { paiseToInputString } from "@/lib/money";

interface Props {
  code: string;
  members: { id: string; name: string }[];
  /** Pre-fill from a suggested transfer ("Mark as paid"). */
  suggestion?: { fromMemberId: string; toMemberId: string; amountPaise: number };
  triggerLabel?: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
}

/**
 * Record that a payment happened outside the app. Purely informational:
 * Trip Split never moves money and cannot verify the payment.
 */
export function RecordPaymentDialog({
  code,
  members,
  suggestion,
  triggerLabel = "Record a payment",
  triggerVariant = "outline",
  triggerSize = "default",
}: Props) {
  const router = useRouter();
  const today = todayInIndia();
  const initial = () => ({
    fromMemberId: suggestion?.fromMemberId ?? members[0]?.id ?? "",
    toMemberId: suggestion?.toMemberId ?? members[1]?.id ?? "",
    amount: suggestion ? paiseToInputString(suggestion.amountPaise) : "",
    paidOn: today,
    note: "",
  });
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof ReturnType<typeof initial>) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));
  const from = members.find((m) => m.id === suggestion?.fromMemberId);
  const to = members.find((m) => m.id === suggestion?.toMemberId);
  const Icon = suggestion ? CheckCheck : HandCoins;

  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        onClick={() => {
          setValues(initial());
          setErrors({});
          setFormError(null);
          setOpen(true);
        }}
        aria-label={suggestion && from && to ? `Mark ${from.name} → ${to.name} as paid` : undefined}
      >
        <Icon aria-hidden="true" />
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{suggestion ? "Mark as paid" : "Record a payment"}</DialogTitle>
          <DialogDescription>
            Record a payment someone already made, by UPI, cash or anything else. Trip Split
            doesn&apos;t move money and can&apos;t check that it happened; this only updates the
            balances everyone sees.
          </DialogDescription>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setFormError(null);
              startTransition(async () => {
                try {
                  const result = await recordPaymentAction(code, values);
                  if (!result.ok) {
                    setErrors(result.fieldErrors ?? {});
                    setFormError(result.error);
                    return;
                  }
                  setOpen(false);
                  toast.success("Payment recorded. Balances updated.");
                  router.refresh();
                } catch {
                  setFormError(GENERIC_ERROR);
                }
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="payment-from" label="Who paid" error={errors.fromMemberId}>
                {(aria) => (
                  <Select {...aria} value={values.fromMemberId} onChange={set("fromMemberId")}>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="payment-to" label="Paid to" error={errors.toMemberId}>
                {(aria) => (
                  <Select {...aria} value={values.toMemberId} onChange={set("toMemberId")}>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field
                id="payment-amount"
                label="Amount"
                error={errors.amount}
                hint={suggestion ? "Change it if only part was paid." : undefined}
              >
                {(aria) => (
                  <div className="relative">
                    <span
                      className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                      aria-hidden="true"
                    >
                      ₹
                    </span>
                    <Input
                      {...aria}
                      value={values.amount}
                      onChange={set("amount")}
                      inputMode="decimal"
                      autoComplete="off"
                      className="tabular pl-7"
                    />
                  </div>
                )}
              </Field>
              <Field id="payment-date" label="Date paid" error={errors.paidOn}>
                {(aria) => (
                  <Input
                    {...aria}
                    type="date"
                    max={today}
                    value={values.paidOn}
                    onChange={set("paidOn")}
                  />
                )}
              </Field>
            </div>
            <Field id="payment-note" label="Note" optional error={errors.note}>
              {(aria) => (
                <Input
                  {...aria}
                  value={values.note}
                  onChange={set("note")}
                  maxLength={200}
                  placeholder="e.g. UPI, cash at the airport"
                />
              )}
            </Field>
            {formError ? (
              <p role="alert" className="bg-pay-bg text-pay rounded-lg p-3 text-sm">
                {formError}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Record payment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
