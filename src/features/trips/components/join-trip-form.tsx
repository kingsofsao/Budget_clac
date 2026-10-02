"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form-controls";
import { openTripAction } from "@/features/trips/actions";

export function JoinTripForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setError(undefined);
        startTransition(async () => {
          try {
            const result = await openTripAction({ code });
            if (result.ok) router.push(`/trip/${result.data.code}`);
            else setError(result.error);
          } catch {
            setError("Something went wrong. Please try again.");
          }
        });
      }}
    >
      <Label htmlFor="trip-code">Trip code or link</Label>
      <div className="flex gap-2">
        <Input
          id="trip-code"
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. BGLDEMX2"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "trip-code-error" : undefined}
          className="uppercase placeholder:normal-case"
        />
        <Button type="submit" disabled={pending} aria-label="Open trip">
          {pending ? "Opening…" : "Open"}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
      <FieldError id="trip-code-error" message={error} />
    </form>
  );
}
