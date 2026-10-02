"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { clearOfflineCache } from "@/components/service-worker";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { saveAccountAction } from "@/features/auth/actions";
import { GENERIC_ERROR } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

export function SaveAccountForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setFormError(null);
        startTransition(async () => {
          try {
            const result = await saveAccountAction({ email, password });
            if (!result.ok) {
              setErrors(result.fieldErrors ?? {});
              setFormError(result.error);
              return;
            }
            setErrors({});
            setDone(result.data.email);
            router.refresh();
          } catch {
            setFormError(GENERIC_ERROR);
          }
        });
      }}
    >
      <Field id="account-email" label="Email" error={errors.email}>
        {(aria) => (
          <Input
            {...aria}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </Field>
      <Field
        id="account-password"
        label="Password"
        hint="At least 8 characters."
        error={errors.password}
      >
        {(aria) => (
          <Input
            {...aria}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      {formError ? (
        <p role="alert" className="bg-pay-bg text-pay rounded-lg p-3 text-sm">
          {formError}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="bg-receive-bg text-receive rounded-lg p-3 text-sm">
          Saved. If asked, confirm the email we sent to {done}. Your trips stay attached to this
          account.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save account"}
      </Button>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await createClient().auth.signOut();
          await clearOfflineCache();
          router.replace("/");
          router.refresh();
        } catch {
          toast.error(GENERIC_ERROR);
          setPending(false);
        }
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
