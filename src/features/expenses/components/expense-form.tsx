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
import { sharesForExpense } from "@/features/expenses/split";
import { orderByMembers } from "@/lib/calculations";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/categories";
import { eachDay, formatShortDate } from "@/lib/dates";
import { GENERIC_ERROR } from "@/lib/errors";
import {
  basisPointsToInputString,
  formatBasisPoints,
  formatINR,
  paiseToInputString,
  parseINR,
  parsePercent,
  splitEqual,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import { parseExpenseForm, parseShareCount, type ExpenseFormValues } from "@/lib/validation";
import type { Member, SplitMethod } from "@/types/domain";

type FormValues = ExpenseFormValues & { splitInputsTotal?: string };

const SPLIT_OPTIONS: { method: SplitMethod; label: string }[] = [
  { method: "equal", label: "Equally" },
  { method: "custom", label: "Amounts" },
  { method: "shares", label: "Shares" },
  { method: "percentage", label: "Percent" },
];

const SPLIT_HELP: Record<SplitMethod, string> = {
  equal: "Everyone ticked pays the same. Leftover paise go to the first people in the list.",
  custom: "Enter what each person owes. The total must match the amount exactly.",
  shares: "Give more shares to people who should pay more: 2 shares pay twice as much as 1.",
  percentage: "Enter each person's percentage. They must add up to exactly 100%.",
};

const INPUT_LABEL: Record<SplitMethod, string> = {
  equal: "share",
  custom: "share",
  shares: "number of shares",
  percentage: "percentage",
};

/** Map our shared validator's flat field errors into react-hook-form's nested shape. */
function toFieldErrors(flat: Record<string, string>): FieldErrors<FormValues> {
  const errors: Record<string, unknown> = {};
  const inputs: Record<string, { type: string; message: string }> = {};
  for (const [key, message] of Object.entries(flat)) {
    if (key.startsWith("splitInputs."))
      inputs[key.slice("splitInputs.".length)] = { type: "validate", message };
    else if (key === "splitInputs") errors.splitInputsTotal = { type: "validate", message };
    else errors[key] = { type: "validate", message };
  }
  if (Object.keys(inputs).length) errors.splitInputs = inputs;
  return errors as FieldErrors<FormValues>;
}

const resolver: Resolver<FormValues> = async (values) => {
  const result = parseExpenseForm(values);
  return result.ok
    ? { values, errors: {} }
    : { values: {}, errors: toFieldErrors(result.fieldErrors) };
};

/** Parse one per-person input for the given method (display preview only). */
function parseInput(method: SplitMethod, raw: string): number | null {
  if (method === "custom") return parseINR(raw);
  if (method === "shares") return parseShareCount(raw);
  const bp = parsePercent(raw);
  return bp === 0 ? null : bp;
}

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
  const splitInputs = useWatch({ control, name: "splitInputs" });
  const paidBy = useWatch({ control, name: "paidByMemberId" });
  const amountPaise = parseINR(amountText ?? "");
  const validAmount = amountPaise !== null && amountPaise > 0 ? amountPaise : null;
  const days = useMemo(() => eachDay(trip.startDate, trip.endDate), [trip.startDate, trip.endDate]);
  const selected = useMemo(() => new Set(participantIds), [participantIds]);

  // Per-person inputs as numbers (paise / shares / basis points) for live feedback.
  const typed = useMemo(() => {
    const values = new Map<string, number>();
    let total = 0;
    let invalid = false;
    if (splitMethod === "equal") return { values, total, invalid };
    for (const id of participantIds) {
      const raw = (splitInputs[id] ?? "").trim();
      if (!raw) {
        if (splitMethod !== "custom") invalid = true;
        continue;
      }
      const v = parseInput(splitMethod, raw);
      if (v === null) invalid = true;
      else {
        values.set(id, v);
        total += v;
      }
    }
    return { values, total, invalid };
  }, [participantIds, splitInputs, splitMethod]);

  // Live preview of each person's amount (display only; the server recomputes).
  const preview = useMemo(() => {
    const none = new Map<string, number>();
    if (!validAmount || participantIds.length === 0 || splitMethod === "custom") return none;
    if (splitMethod !== "equal" && typed.invalid) return none;
    if (splitMethod === "percentage" && typed.total !== 10_000) return none;
    try {
      const shares = sharesForExpense(
        { splitMethod, amountPaise: validAmount, participantIds, splitValues: typed.values },
        members,
      );
      return new Map(shares.map((s) => [s.memberId, s.sharePaise]));
    } catch {
      return none;
    }
  }, [splitMethod, validAmount, participantIds, typed, members]);

  /** Sensible starting values when switching method, so people only adjust differences. */
  const defaultInputs = (method: SplitMethod, ids: string[]): Record<string, string> => {
    const ordered = orderByMembers(ids, members);
    const next: Record<string, string> = {};
    if (method === "shares") ordered.forEach((id) => (next[id] = "1"));
    if (method === "percentage" && ordered.length) {
      const parts = splitEqual(10_000, ordered.length);
      ordered.forEach((id, i) => (next[id] = basisPointsToInputString(parts[i] ?? 0)));
    }
    if (method === "custom" && validAmount && ordered.length) {
      const parts = splitEqual(validAmount, ordered.length);
      ordered.forEach((id, i) => (next[id] = paiseToInputString(parts[i] ?? 0)));
    }
    return next;
  };

  const setParticipants = (ids: string[]) => {
    const ordered = orderByMembers(ids, members);
    setValue("participantIds", ordered, {
      shouldValidate: formState.isSubmitted,
      shouldDirty: true,
    });
    // Someone newly ticked in a shares split starts with 1 share.
    if (splitMethod === "shares") {
      const current = getValues("splitInputs");
      const next = { ...current };
      for (const id of ordered) if (!(current[id] ?? "").trim()) next[id] = "1";
      setValue("splitInputs", next);
    }
  };

  const switchSplit = (method: SplitMethod) => {
    if (method === splitMethod) return;
    setValue("splitMethod", method, { shouldDirty: true });
    setValue("splitInputs", defaultInputs(method, participantIds), { shouldDirty: true });
  };

  const save = async (values: FormValues, addAnother: boolean) => {
    setFormError(null);
    const { splitInputsTotal: _ignored, ...payload } = values;
    void _ignored;
    try {
      const result = await saveExpenseAction(code, expenseId, payload);
      if (!result.ok) {
        const mapped = toFieldErrors(result.fieldErrors ?? {});
        for (const [key, err] of Object.entries(mapped)) {
          if (key === "splitInputs") {
            for (const [id, e] of Object.entries(err as Record<string, { message: string }>)) {
              setError(`splitInputs.${id}`, { message: e.message });
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
  const remaining = validAmount !== null ? validAmount - typed.total : null;
  const customValid = remaining === 0 && !typed.invalid;
  const percentValid = typed.total === 10_000 && !typed.invalid;

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
          className="bg-muted grid grid-cols-4 gap-1 rounded-lg p-1"
        >
          {SPLIT_OPTIONS.map(({ method, label }) => (
            <button
              key={method}
              type="button"
              role="radio"
              aria-checked={splitMethod === method}
              onClick={() => switchSplit(method)}
              className={cn(
                "h-10 rounded-md text-sm font-medium",
                splitMethod === method
                  ? "bg-card shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p id="split-help" className="text-muted-foreground text-sm">
          {SPLIT_HELP[splitMethod]}
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
            const inputError = errors.splitInputs?.[m.id]?.message;
            const amount = preview.get(m.id);
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
                  className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2"
                >
                  <MemberAvatar name={m.name} color={m.color} size="sm" />
                  <span className="truncate font-medium">{m.name}</span>
                  {m.id === paidBy ? (
                    <span className="text-muted-foreground text-xs">(paid)</span>
                  ) : null}
                </label>
                {!checked ? (
                  <span className="text-muted-foreground text-sm">Not included</span>
                ) : splitMethod === "equal" ? (
                  <span className="tabular text-sm font-medium">
                    {amount !== undefined ? formatINR(amount) : "—"}
                  </span>
                ) : (
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="flex items-center gap-2">
                      {splitMethod !== "custom" ? (
                        <span className="tabular text-muted-foreground text-sm">
                          {amount !== undefined ? formatINR(amount) : "—"}
                        </span>
                      ) : null}
                      <div className={cn("relative", splitMethod === "custom" ? "w-32" : "w-24")}>
                        {splitMethod === "custom" ? (
                          <span
                            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
                            aria-hidden="true"
                          >
                            ₹
                          </span>
                        ) : null}
                        <Input
                          {...register(`splitInputs.${m.id}`)}
                          aria-label={`${m.name}'s ${INPUT_LABEL[splitMethod]}`}
                          aria-invalid={inputError ? true : undefined}
                          inputMode={splitMethod === "shares" ? "numeric" : "decimal"}
                          autoComplete="off"
                          placeholder="0"
                          className={cn(
                            "tabular h-10 text-right",
                            splitMethod === "custom" ? "pl-6" : "pr-8",
                          )}
                        />
                        {splitMethod !== "custom" ? (
                          <span
                            className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm"
                            aria-hidden="true"
                          >
                            {splitMethod === "shares" ? "×" : "%"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {inputError ? (
                      <span className="text-destructive text-xs">{inputError}</span>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <FieldError message={errors.participantIds?.message} />

        {splitMethod === "custom" && validAmount !== null ? (
          <TotalBar ok={customValid}>
            <span>
              Total entered <strong className="tabular">{formatINR(typed.total)}</strong> of{" "}
              <strong className="tabular">{formatINR(validAmount)}</strong>
            </span>
            <span className="flex items-center gap-1 font-medium">
              {customValid ? (
                <>
                  <CheckCircle2 className="size-4" aria-hidden="true" /> Valid
                </>
              ) : remaining !== null && remaining > 0 ? (
                `${formatINR(remaining)} left to assign`
              ) : remaining !== null ? (
                <span className="text-pay">{formatINR(-remaining)} too much</span>
              ) : null}
            </span>
          </TotalBar>
        ) : null}
        {splitMethod === "percentage" && participantIds.length > 0 ? (
          <TotalBar ok={percentValid}>
            <span>
              Total <strong className="tabular">{formatBasisPoints(typed.total)}</strong> of 100%
            </span>
            <span className="flex items-center gap-1 font-medium">
              {percentValid ? (
                <>
                  <CheckCircle2 className="size-4" aria-hidden="true" /> Valid
                </>
              ) : typed.total < 10_000 ? (
                `${formatBasisPoints(10_000 - typed.total)} left`
              ) : (
                <span className="text-pay">{formatBasisPoints(typed.total - 10_000)} too much</span>
              )}
            </span>
          </TotalBar>
        ) : null}
        {splitMethod === "shares" && participantIds.length > 0 && !typed.invalid ? (
          <TotalBar ok>
            <span>
              <strong className="tabular">{typed.total}</strong> shares in total
            </span>
            {validAmount ? (
              <span className="tabular font-medium">
                ≈ {formatINR(Math.round(validAmount / Math.max(1, typed.total)))} per share
              </span>
            ) : null}
          </TotalBar>
        ) : null}
        <FieldError message={errors.splitInputsTotal?.message} />

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

function TotalBar({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-sm",
        ok ? "bg-receive-bg text-receive" : "bg-muted",
      )}
    >
      {children}
    </div>
  );
}
