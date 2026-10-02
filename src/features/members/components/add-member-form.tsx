"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { addMemberAction } from "@/features/members/actions";
import { GENERIC_ERROR } from "@/lib/errors";

/** Quick inline form: type a name, press Enter, repeat. Optimised for adding a whole group fast. */
export function AddMemberForm({ code, autoFocus }: { code: string; autoFocus?: boolean }) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) {
          setErrors({ name: "Enter a name." });
          nameRef.current?.focus();
          return;
        }
        startTransition(async () => {
          try {
            const result = await addMemberAction(code, { name, email });
            if (!result.ok) {
              setErrors(result.fieldErrors ?? { name: result.error });
              return;
            }
            toast.success(`${name.trim()} added`);
            setName("");
            setEmail("");
            setErrors({});
            router.refresh();
            nameRef.current?.focus();
          } catch {
            setErrors({ name: GENERIC_ERROR });
          }
        });
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field id="member-name" label="Name" error={errors.name} className="flex-1">
          {(aria) => (
            <Input
              {...aria}
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nithish"
              autoComplete="off"
              autoFocus={autoFocus}
              enterKeyHint="done"
              maxLength={40}
            />
          )}
        </Field>
        {showEmail ? (
          <Field id="member-email" label="Email" optional error={errors.email} className="flex-1">
            {(aria) => (
              <Input
                {...aria}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        <Button type="submit" disabled={pending} className="sm:mt-[1.625rem]">
          <UserPlus aria-hidden="true" />
          {pending ? "Adding…" : "Add person"}
        </Button>
      </div>
      {!showEmail ? (
        <button
          type="button"
          className="text-primary self-start text-sm underline-offset-4 hover:underline"
          onClick={() => setShowEmail(true)}
        >
          Add an email (optional)
        </button>
      ) : null}
    </form>
  );
}
