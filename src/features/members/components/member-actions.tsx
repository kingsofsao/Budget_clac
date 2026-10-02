"use client";

import { Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form-controls";
import {
  claimMemberAction,
  removeMemberAction,
  updateMemberAction,
} from "@/features/members/actions";
import { GENERIC_ERROR } from "@/lib/errors";
import { plural } from "@/lib/utils";
import type { Member } from "@/types/domain";

interface Props {
  code: string;
  member: Member;
  isMe: boolean;
  canClaim: boolean;
  expensesPaid: number;
  expensesJoined: number;
  /** True when the person appears in recorded payments. */
  hasPayments?: boolean;
}

export function MemberActions({
  code,
  member,
  isMe,
  canClaim,
  expensesPaid,
  expensesJoined,
  hasPayments = false,
}: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inUse = expensesPaid > 0 || expensesJoined > 0 || hasPayments;

  return (
    <div className="flex items-center gap-1">
      {canClaim && !isMe ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await claimMemberAction(code, member.id, true).catch(() => null);
              if (r?.ok) {
                toast.success(`You're now linked as ${member.name}`);
                router.refresh();
              } else toast.error(r && !r.ok ? r.error : GENERIC_ERROR);
            })
          }
        >
          <UserCheck aria-hidden="true" />
          This is me
        </Button>
      ) : null}
      {isMe ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Unlink yourself from ${member.name}`}
          title="This isn't me"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await claimMemberAction(code, member.id, false).catch(() => null);
              if (r?.ok) router.refresh();
              else toast.error(r && !r.ok ? r.error : GENERIC_ERROR);
            })
          }
        >
          <UserX aria-hidden="true" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Edit ${member.name}`}
        onClick={() => setEditOpen(true)}
      >
        <Pencil aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${member.name}`}
        onClick={() => {
          setRemoveError(null);
          setRemoveOpen(true);
        }}
      >
        <Trash2 aria-hidden="true" />
      </Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogTitle>Edit person</DialogTitle>
          <DialogDescription>
            Changing a name updates it everywhere, including past expenses.
          </DialogDescription>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                try {
                  const r = await updateMemberAction(code, member.id, { name, email });
                  if (!r.ok) {
                    setErrors(r.fieldErrors ?? { name: r.error });
                    return;
                  }
                  setErrors({});
                  setEditOpen(false);
                  toast.success("Saved");
                  router.refresh();
                } catch {
                  setErrors({ name: GENERIC_ERROR });
                }
              });
            }}
          >
            <Field id={`edit-name-${member.id}`} label="Name" error={errors.name}>
              {(aria) => (
                <Input
                  {...aria}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                />
              )}
            </Field>
            <Field id={`edit-email-${member.id}`} label="Email" optional error={errors.email}>
              {(aria) => (
                <Input
                  {...aria}
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {inUse ? (
        <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
          <DialogContent role="alertdialog">
            <DialogTitle>{member.name} can&apos;t be removed yet</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-2">
                <p>
                  {member.name} paid for {plural(expensesPaid, "expense")} and shares in{" "}
                  {plural(expensesJoined, "expense")}
                  {hasPayments ? ", and appears in recorded payments" : ""}. Removing them would
                  change everyone&apos;s balances, so history is never changed silently.
                </p>
                <p>
                  To remove {member.name}, first edit or delete those expenses
                  {hasPayments ? " and delete their recorded payments" : ""}.
                </p>
              </div>
            </DialogDescription>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>
              OK
            </Button>
          </DialogContent>
        </Dialog>
      ) : (
        <ConfirmDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          title={`Remove ${member.name}?`}
          description={`${member.name} isn't part of any expense, so nobody's balance will change.`}
          confirmLabel="Remove person"
          pendingLabel="Removing…"
          pending={pending}
          error={removeError}
          onConfirm={() =>
            startTransition(async () => {
              try {
                const r = await removeMemberAction(code, member.id);
                if (!r.ok) {
                  setRemoveError(r.error);
                  return;
                }
                setRemoveOpen(false);
                toast.success(`${member.name} removed`);
                router.refresh();
              } catch {
                setRemoveError(GENERIC_ERROR);
              }
            })
          }
        />
      )}
    </div>
  );
}
