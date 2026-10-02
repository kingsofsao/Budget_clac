"use client";

import { CheckCircle2, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm, useWatch, type FieldErrors, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { MemberAvatar } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  Checkbox,
  Field,
  FieldError,
  Input,
  Select,
  Textarea,
} from "@/components/ui/form-controls";
import { saveExpenseAction } from "@/features/expenses/actions";
import { calculateExpenseShares, orderByMembers } from "@/lib/calculations";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/categories";
import { eachDay, formatShortDate } from "@/lib/dates";
import { GENERIC_ERROR } from "@/lib/errors";
import { formatINR, paiseToInputString, parseINR, splitEqual } from "@/lib/money";
import { cn } from "@/lib/utils";
import { parseExpenseForm, type ExpenseFormValues } from "@/lib/validation";
import type { Member } from "@/types/domain";

type FormValues = ExpenseFormValues & { customSharesTotal?: string };

/** Map our shared validator's flat field errors into react-hook-form's nested shape. */
function toFieldErrors(flat: Record<string, string>): FieldErrors<FormValues> {
  const errors: Record<string, unknown> = {};
  const shares: Record<string, { type: string; message: string }> = {};
  for (const [key, message] of Object.entries(flat)) {
    if (key.startsWith("customShares."))
      shares[key.slice("customShares.".length)] = { type: "validate", message };
    else if (key === "customShares") errors.customSharesTotal = { type: "validate", message };
    else errors[key] = { type: "validate", message };
  }
  if (Object.keys(shares).length) errors.customShares = shares;
  return errors as FieldErrors<FormValues>;
}

const resolver: Resolver<FormValues> = async (values) => {
  const result = parseExpenseForm(values);
  return result.ok
    ? { values, errors: {} }
    : { values: {}, errors: toFieldErrors(result.fieldErrors) };
};

interface ExpenseFormProps {
  code: string;
  members: Member[];
  trip: { startDate: string; endDate: string };
  expenseId: string | null;
  defaultValues: ExpenseFormValues;
}

export function ExpenseForm({ code, members, trip, expenseId, defaultValues }: ExpenseFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver,
    defaultValues,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const { register, handleSubmit, setValue, control, formState, setError, reset, getValues } = form;
  const { errors } = formState;

  const amountText = useWatch({ control, name: "amount" });
  const splitMethod = useWatch({ control, name: "splitMethod" });
  const participantIds = useWatch({ control, name: "participantIds" });
  const customShares = useWatch({ control, name: "customShares" });
  const paidBy = useWatch({ control, name: "paidByMemberId" });
  const amountPaise = parseINR(amountText ?? "");
  const validAmount = amountPaise !== null && amountPaise > 0 ? amountPaise : null;
  const days = useMemo(() => eachDay(trip.startDate, trip.endDate), [trip.startDate, trip.endDate]);
  const selected = useMemo(() => new Set(participantIds), [participantIds]);

  // Live preview of equal shares (display only — the server recomputes).
  const equalShares = useMemo(() => {
    if (splitMethod !== "equal" || !validAmount || participantIds.length === 0)
      return new Map<string, number>();
    const ordered = orderByMembers(participantIds, members);
    return new Map(
      calculateExpenseShares({
        method: "equal",
        amountPaise: validAmount,
        participantIds: ordered,
      }).map((s) => [s.memberId, s.sharePaise]),
    );
  }, [splitMethod, validAmount, participantIds, members]);

  const customTotal = useMemo(() => {
    let total = 0;
    let invalid = false;
    for (const id of participantIds) {
      const raw = (customShares[id] ?? "").trim();
      if (!raw) continue;
      const p = parseINR(raw);
      if (p === null) invalid = true;
      else total += p;
    }
    return { total, invalid };
  }, [participantIds, customShares]);

  const setParticipants = (ids: string[]) =>
    setValue("participantIds", orderByMembers(ids, members), {
      shouldValidate: formState.isSubmitted,
      shouldDirty: true,
    });

  const switchSplit = (method: "equal" | "custom") => {
    setValue("splitMethod", method, { shouldDirty: true });
    // Pre-fill custom amounts with the equal split so the user only adjusts differences.
    if (method === "custom" && validAmount && participantIds.length > 0) {
      const current = getValues("customShares");
      const hasValues = participantIds.some((id) => (current[id] ?? "").trim() !== "");
      if (!hasValues) {
        const ordered = orderByMembers(participantIds, members);
        const parts = splitEqual(validAmount, ordered.length);
        const next: Record<string, string> = {};
        ordered.forEach((id, i) => (next[id] = paiseToInputString(parts[i] ?? 0)));
        setValue("customShares", next);
      }
    }
  };

  const save = async (values: FormValues, addAnother: boolean) => {
    setFormError(null);
    const { customSharesTotal: _ignored, ...payload } = values;
    void _ignored;
    try {
      const result = await saveExpenseAction(code, expenseId, payload);
      if (!result.ok) {
        const mapped = toFieldErrors(result.fieldErrors ?? {});
        for (const [key, err] of Object.entries(mapped)) {
          if (key === "customShares") {
            for (const [id, e] of Object.entries(err as Record<string, { message: string }>)) {
              setError(`customShares.${id}`, { message: e.message });
            }
          } else
            setError(key as keyof FormValues, { message: (err as { message: string }).message });
        }
        setFormError(result.error);
        return;
      }
      if (expenseId) {
        toast.success("Expense updated. Balances recalculated.");
        router.push(`/trip/${code}/expenses/${expenseId}`);
      } else if (addAnother) {
        toast.success(`“${values.description}” added`);
        reset({
          ...defaultValues,
          expenseDate: values.expenseDate,
          paidByMemberId: values.paidByMemberId,
          category: values.category,
        });
        router.refresh();
        document.getElementById("expense-amount")?.focus();
      } else {
        toast.success(`“${values.description}” added`);
        router.push(`/trip/${code}/expenses`);
      }
    } catch {
      setFormError(GENERIC_ERROR);
    }
  };
  const onSubmit = handleSubmit((values) => save(values, false));
  const onSubmitAndAddAnother = handleSubmit((values) => save(values, true));

  const payer = members.find((m) => m.id === paidBy);
  const remaining = validAmount !== null ? validAmount - customTotal.total : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="expense-amount" label="Amount" error={errors.amount?.message}>
          {(aria) => (
            <div className="relative">
              <span
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xl"
                aria-hidden="true"
              >
                ₹
              </span>
              <Input
                {...aria}
                {...register("amount")}
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="next"
                placeholder="0"
                className="tabular h-14 pl-8 text-2xl font-semibold"
              />
            </div>
          )}
        </Field>
        <Field id="expense-description" label="Description" error={errors.description?.message}>
          {(aria) => (
            <Input
              {...aria}
              {...register("description")}
              placeholder="e.g. Airport cab"
              autoComplete="off"
              enterKeyHint="next"
              maxLength={80}
              className="sm:h-14"
            />
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Category</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_IDS.map((id) => (
            <label
              key={id}
              className="border-input bg-card has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground relative flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm has-[:checked]:font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]"
            >
              <input type="radio" value={id} {...register("category")} className="sr-only" />
              <span aria-hidden="true">{CATEGORIES[id].emoji}</span>
              {CATEGORIES[id].label}
            </label>
          ))}
        </div>
        <FieldError message={errors.category?.message} />
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="expense-paid-by" label="Paid by" error={errors.paidByMemberId?.message}>
          {(aria) => (
            <Select {...aria} {...register("paidByMemberId")}>
              <option value="" disabled>
                Choose who paid
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {days.length === 1 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Date</span>
            <p className="text-muted-foreground flex h-11 items-center text-sm">
              {formatShortDate(days[0]!)} (one-day outing)
            </p>
          </div>
        ) : days.length <= 31 ? (
          <Field id="expense-date" label="Date" error={errors.expenseDate?.message}>
            {(aria) => (
              <Select {...aria} {...register("expenseDate")}>
                {days.map((d, i) => (
                  <option key={d} value={d}>
                    Day {i + 1} · {formatShortDate(d)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <Field id="expense-date" label="Date" error={errors.expenseDate?.message}>
            {(aria) => (
              <Input
                {...aria}
                type="date"
                min={trip.startDate}
                max={trip.endDate}
                {...register("expenseDate")}
              />
            )}
          </Field>
        )}
      </div>

      <fieldset className="flex flex-col gap-3" aria-describedby="split-help">
        <legend className="mb-2 text-sm font-medium">Split between</legend>
        <div
          role="radiogroup"
          aria-label="Split method"
          className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1"
        >
          {(["equal", "custom"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={splitMethod === m}
              onClick={() => switchSplit(m)}
              className={cn(
                "h-10 rounded-md text-sm font-medium",
                splitMethod === m
                  ? "bg-card shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "equal" ? "Equally" : "Custom amounts"}
            </button>
          ))}
        </div>
        <p id="split-help" className="text-muted-foreground text-sm">
          {splitMethod === "equal"
            ? "Everyone ticked pays the same. Leftover paise go to the first people in the list."
            : "Enter what each person owes. The total must match the amount exactly."}
        </p>

        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm" aria-live="polite">
            {participantIds.length} of {members.length} selected
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setParticipants(members.map((m) => m.id))}
            >
              Select everyone
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setParticipants([])}>
              Deselect all
            </Button>
          </div>
        </div>

        <ul className="bg-card flex flex-col divide-y rounded-xl border">
          {members.map((m) => {
            const checked = selected.has(m.id);
            const shareError = errors.customShares?.[m.id]?.message;
            return (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                <Checkbox
                  id={`participant-${m.id}`}
                  checked={checked}
                  onChange={(e) =>
                    setParticipants(
                      e.target.checked
                        ? [...participantIds, m.id]
                        : participantIds.filter((id) => id !== m.id),
                    )
                  }
                />
                <label
                  htmlFor={`participant-${m.id}`}
                  className="flex min-h-11 flex-1 cursor-pointer items-center gap-2"
                >
                  <MemberAvatar name={m.name} color={m.color} size="sm" />
                  <span className="font-medium">{m.name}</span>
                  {m.id === paidBy ? (
                    <span className="text-muted-foreground text-xs">(paid)</span>
                  ) : null}
                </label>
                {splitMethod === "equal" ? (
                  <span
                    className={cn(
                      "tabular text-sm",
                      checked ? "font-medium" : "text-muted-foreground",
                    )}
                  >
                    {checked && equalShares.has(m.id)
                      ? formatINR(equalShares.get(m.id)!)
                      : checked
                        ? "—"
                        : "Not included"}
                  </span>
                ) : checked ? (
                  <div className="flex flex-col items-end">
                    <div className="relative w-32">
                      <span
                        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
                        aria-hidden="true"
                      >
                        ₹
                      </span>
                      <Input
                        {...register(`customShares.${m.id}`)}
                        aria-label={`${m.name}'s share`}
                        aria-invalid={shareError ? true : undefined}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        className="tabular h-10 pl-6 text-right"
                      />
                    </div>
                    {shareError ? (
                      <span className="text-destructive text-xs">{shareError}</span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">Not included</span>
                )}
              </li>
            );
          })}
        </ul>
        <FieldError message={errors.participantIds?.message} />

        {splitMethod === "custom" && validAmount !== null ? (
          <div
            aria-live="polite"
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-sm",
              remaining === 0 && !customTotal.invalid ? "bg-receive-bg text-receive" : "bg-muted",
            )}
          >
            <span>
              Total entered <strong className="tabular">{formatINR(customTotal.total)}</strong> of{" "}
              <strong className="tabular">{formatINR(validAmount)}</strong>
            </span>
            <span className="flex items-center gap-1 font-medium">
              {remaining === 0 && !customTotal.invalid ? (
                <>
                  <CheckCircle2 className="size-4" aria-hidden="true" /> Valid
                </>
              ) : remaining !== null && remaining > 0 ? (
                `${formatINR(remaining)} left to assign`
              ) : remaining !== null ? (
                <span className="text-pay">{formatINR(-remaining)} too much</span>
              ) : null}
            </span>
          </div>
        ) : null}
        <FieldError message={errors.customSharesTotal?.message} />

        {payer && !selected.has(payer.id) && participantIds.length > 0 ? (
          <p className="bg-accent/60 text-accent-foreground flex gap-2 rounded-xl p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {payer.name} paid but isn&apos;t sharing this expense, so {payer.name} gets the full
            amount back.
          </p>
        ) : null}
      </fieldset>

      <Field id="expense-notes" label="Notes" optional error={errors.notes?.message}>
        {(aria) => <Textarea {...aria} {...register("notes")} rows={2} maxLength={500} />}
      </Field>

      {formError ? (
        <p role="alert" className="bg-pay-bg text-pay rounded-lg p-3 text-sm">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <Button type="submit" size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Saving…" : expenseId ? "Save changes" : "Save expense"}
        </Button>
        {!expenseId ? (
          <Button
            size="lg"
            variant="outline"
            disabled={formState.isSubmitting}
            onClick={onSubmitAndAddAnother}
          >
            Save &amp; add another
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="lg"
          onClick={() => router.back()}
          disabled={formState.isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
