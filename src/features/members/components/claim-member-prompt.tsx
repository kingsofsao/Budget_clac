"use client";

import { UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/form-controls";
import { addMemberAction, claimMemberAction } from "@/features/members/actions";
import { GENERIC_ERROR } from "@/lib/errors";
import type { Member } from "@/types/domain";

const NEW = "__new__";

/** "Which one are you?": links this browser's user to a person, so activity shows their name. */
export function ClaimMemberPrompt({ code, members }: { code: string; members: Member[] }) {
  const router = useRouter();
  const unclaimed = members.filter((m) => !m.userId);
  const [choice, setChoice] = useState(unclaimed[0]?.id ?? NEW);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();
  if (dismissed) return null;

  return (
    <form
      className="border-primary/30 bg-accent/50 flex flex-col gap-3 rounded-2xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => {
          try {
            const result =
              choice === NEW
                ? await addMemberAction(code, { name }, { claim: true })
                : await claimMemberAction(code, choice, true);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            toast.success("Thanks! You're linked to this trip.");
            router.refresh();
          } catch {
            setError(GENERIC_ERROR);
          }
        });
      }}
    >
      <div className="flex items-start gap-3">
        <UserCheck className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">Which one are you?</p>
          <p className="text-muted-foreground text-sm">
            Pick your name so your balance is highlighted and changes show who made them.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="claim-member">I am</Label>
          <Select id="claim-member" value={choice} onChange={(e) => setChoice(e.target.value)}>
            {unclaimed.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value={NEW}>Not listed — add me</option>
          </Select>
        </div>
        {choice === NEW ? (
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="claim-name">Your name</Label>
            <Input
              id="claim-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              maxLength={40}
            />
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Confirm"}
          </Button>
          <Button variant="ghost" onClick={() => setDismissed(true)}>
            Not now
          </Button>
        </div>
      </div>
      <FieldError message={error} />
    </form>
  );
}
