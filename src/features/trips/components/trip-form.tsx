"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Label, Textarea } from "@/components/ui/form-controls";
import { createTripAction, updateTripAction } from "@/features/trips/actions";
import { dayCount, isValidISODate } from "@/lib/dates";
import { GENERIC_ERROR } from "@/lib/errors";
import { createTripSchema, tripDetailsSchema } from "@/lib/validation";

type Values = {
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  creatorName?: string;
};

interface TripFormProps {
  mode: "create" | "edit";
  tripCode?: string;
  defaultValues: Values;
}

export function TripForm({ mode, tripCode, defaultValues }: TripFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [oneDay, setOneDay] = useState(defaultValues.startDate === defaultValues.endDate);
  const schema = mode === "create" ? createTripSchema : tripDetailsSchema;
  const form = useForm<Values>({
    // Both schemas share the same input shape; creatorName only exists in create mode.
    resolver: zodResolver(schema as typeof createTripSchema) as never,
    defaultValues,
    mode: "onTouched",
  });
  const { register, handleSubmit, formState, setError, setValue, control } = form;
  const errors = formState.errors;
  const startDate = useWatch({ control, name: "startDate" });
  const endDate = useWatch({ control, name: "endDate" });
  const days =
    isValidISODate(startDate) && isValidISODate(endDate) && endDate >= startDate
      ? dayCount(startDate, endDate)
      : null;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const payload = oneDay ? { ...values, endDate: values.startDate } : values;
    try {
      if (mode === "create") {
        const result = await createTripAction(payload);
        if (!result.ok) {
          for (const [k, v] of Object.entries(result.fieldErrors ?? {}))
            setError(k as keyof Values, { message: v });
          setFormError(result.error);
          return;
        }
        router.push(`/trip/${result.data.code}/people?new=1`);
      } else {
        const result = await updateTripAction(tripCode!, payload);
        if (!result.ok) {
          for (const [k, v] of Object.entries(result.fieldErrors ?? {}))
            setError(k as keyof Values, { message: v });
          setFormError(result.error);
          return;
        }
        toast.success("Trip details saved");
        router.refresh();
      }
    } catch {
      setFormError(GENERIC_ERROR);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field id="trip-name" label="Trip name" error={errors.name?.message}>
        {(aria) => (
          <Input
            {...aria}
            {...register("name")}
            placeholder="e.g. Bangalore Trip"
            autoComplete="off"
            enterKeyHint="next"
            maxLength={80}
          />
        )}
      </Field>

      {mode === "create" ? (
        <Field
          id="creator-name"
          label="Your name"
          hint="You'll be added as the first person on the trip."
          error={errors.creatorName?.message}
        >
          {(aria) => (
            <Input
              {...aria}
              {...register("creatorName")}
              autoComplete="given-name"
              enterKeyHint="next"
              maxLength={40}
            />
          )}
        </Field>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-sm font-medium">Dates</legend>
        <div className="flex items-center gap-2">
          <Checkbox
            id="one-day"
            checked={oneDay}
            onChange={(e) => {
              setOneDay(e.target.checked);
              if (e.target.checked) setValue("endDate", startDate, { shouldValidate: true });
            }}
          />
          <Label htmlFor="one-day" className="font-normal">
            One-day outing
          </Label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="start-date"
            label={oneDay ? "Date" : "Start date"}
            error={errors.startDate?.message}
          >
            {(aria) => (
              <Input
                {...aria}
                type="date"
                {...register("startDate", {
                  onChange: (e) => {
                    if (oneDay) setValue("endDate", e.target.value);
                  },
                })}
              />
            )}
          </Field>
          {!oneDay ? (
            <Field id="end-date" label="End date" error={errors.endDate?.message}>
              {(aria) => <Input {...aria} type="date" min={startDate} {...register("endDate")} />}
            </Field>
          ) : null}
        </div>
        {days !== null ? (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {days === 1 ? "Single-day outing" : `${days}-day trip`}
          </p>
        ) : null}
      </fieldset>

      <Field id="trip-description" label="Description" optional error={errors.description?.message}>
        {(aria) => (
          <Textarea
            {...aria}
            {...register("description")}
            rows={2}
            maxLength={500}
            placeholder="Where, who, what for…"
          />
        )}
      </Field>

      {formError ? (
        <p role="alert" className="bg-pay-bg text-pay rounded-lg p-3 text-sm">
          {formError}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? "Saving…" : mode === "create" ? "Create trip" : "Save changes"}
      </Button>
    </form>
  );
}
