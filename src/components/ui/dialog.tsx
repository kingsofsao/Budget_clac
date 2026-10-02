"use client";

import { X } from "lucide-react";
import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

const overlayClass = "fixed inset-0 z-50 bg-black/50";
const contentClass =
  "fixed z-50 flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto bg-card p-5 text-card-foreground shadow-xl inset-x-0 bottom-0 rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content className={cn(contentClass, className)} {...props}>
        {children}
        <DialogPrimitive.Close
          className="text-muted-foreground hover:bg-muted absolute top-3 right-3 rounded-md p-2"
          aria-label="Close"
        >
          <X className="size-5" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title className={cn("pr-8 text-lg font-semibold", className)} {...props} />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  destructive?: boolean;
  error?: string | null;
}

/** Accessible confirmation (role="alertdialog"); Cancel receives initial focus. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  onConfirm,
  pending,
  destructive = true,
  error,
}: ConfirmDialogProps) {
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className={overlayClass} />
        <AlertPrimitive.Content className={contentClass}>
          <AlertPrimitive.Title className="text-lg font-semibold">{title}</AlertPrimitive.Title>
          <AlertPrimitive.Description asChild>
            <div className="text-muted-foreground text-sm">{description}</div>
          </AlertPrimitive.Description>
          {error ? (
            <p role="alert" className="bg-pay-bg text-pay rounded-lg p-3 text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertPrimitive.Cancel
              className={buttonVariants({ variant: "outline" })}
              disabled={pending}
            >
              Cancel
            </AlertPrimitive.Cancel>
            <button
              type="button"
              className={buttonVariants({ variant: destructive ? "destructive" : "default" })}
              onClick={onConfirm}
              disabled={pending}
            >
              {pending ? (pendingLabel ?? "Working…") : confirmLabel}
            </button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
