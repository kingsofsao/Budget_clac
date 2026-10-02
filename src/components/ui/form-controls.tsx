import * as React from "react";
import { cn } from "@/lib/utils";

const controlBase =
  "w-full rounded-lg border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(controlBase, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(controlBase, "min-h-20 py-2", className)} {...props} />;
}

/** Native select: best keyboard, screen-reader and mobile picker support. */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(controlBase, "h-11 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      >
        <path
          fill="currentColor"
          d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z"
        />
      </svg>
    </div>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-foreground text-sm font-medium", className)} {...props} />;
}

export function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn("size-5 shrink-0 rounded accent-[var(--primary)]", className)}
      {...props}
    />
  );
}

interface FieldProps {
  id: string;
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  className?: string;
  children: (aria: {
    id: string;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}

/** Label + control + hint + error, wired together for screen readers. */
export function Field({ id, label, error, hint, optional, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="text-muted-foreground font-normal"> (optional)</span> : null}
      </Label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-destructive flex items-start gap-1.5 text-sm" role="alert">
      <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0">
        <path
          fill="currentColor"
          d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm0-8a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1Z"
        />
      </svg>
      <span>{message}</span>
    </p>
  );
}
