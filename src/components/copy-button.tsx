"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / non-secure contexts.
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const okay = document.execCommand("copy");
      el.remove();
      return okay;
    } catch {
      return false;
    }
  }
}

interface CopyButtonProps extends Omit<ButtonProps, "onClick"> {
  /** Text to copy, or a function producing it (resolved relative to the current page). */
  text: string | (() => string);
  label: string;
  successMessage?: string;
}

export function CopyButton({
  text,
  label,
  successMessage = "Copied",
  variant = "outline",
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={variant}
      {...props}
      onClick={async () => {
        const value = typeof text === "function" ? text() : text;
        if (await writeClipboard(value)) {
          setCopied(true);
          toast.success(successMessage);
          setTimeout(() => setCopied(false), 2000);
        } else {
          toast.error("Couldn't copy. Please copy it manually.");
        }
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {label}
    </Button>
  );
}

/** Uses the native share sheet when available (mobile), else copies the link. */
export function ShareButton({
  title,
  path,
  text,
  ...props
}: { title: string; path: string; text: string } & Omit<ButtonProps, "onClick">) {
  return (
    <Button
      {...props}
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        if (navigator.share) {
          try {
            await navigator.share({ title, text, url });
            return;
          } catch (err) {
            if ((err as Error).name === "AbortError") return;
          }
        }
        if (await writeClipboard(url)) toast.success("Trip link copied");
        else toast.error("Couldn't share. Copy the link instead.");
      }}
    >
      <Share2 aria-hidden="true" />
      Share
    </Button>
  );
}

export function CopyLinkButton({
  path,
  label = "Copy link",
  ...props
}: { path: string; label?: string } & Omit<ButtonProps, "onClick">) {
  return (
    <CopyButton
      {...props}
      label={label}
      successMessage="Trip link copied"
      text={() => new URL(path, window.location.origin).toString()}
    />
  );
}
