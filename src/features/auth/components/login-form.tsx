"use client";

import { Eye, EyeOff, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { GENERIC_ERROR } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { emailSchema, passwordSchema } from "@/lib/validation";

type Mode = "password" | "magic" | "signup";

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginForm({
  next,
  googleEnabled,
  isGuest,
}: {
  next: string | null;
  googleEnabled: boolean;
  isGuest: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const target = safeNext(next);

  const callbackUrl = () => {
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", target);
    return url.toString();
  };

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const e = emailSchema.safeParse(email);
    const p = mode === "magic" ? { success: true as const } : passwordSchema.safeParse(password);
    const next: typeof errors = {};
    if (!e.success) next.email = e.error.issues[0]?.message;
    if (!p.success && "error" in p) next.password = p.error?.issues[0]?.message;
    setErrors(next);
    if (!e.success || !p.success) return;

    setPending(true);
    const supabase = createClient();
    try {
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({ email: e.data, password });
        if (error) {
          setErrors({
            form: /invalid/i.test(error.message)
              ? "Email or password is incorrect."
              : error.message,
          });
          return;
        }
        router.replace(target);
        router.refresh();
      } else if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email: e.data,
          options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true },
        });
        if (error) {
          setErrors({ form: error.message });
          return;
        }
        setMessage(`We emailed a sign-in link to ${e.data}. Open it on this device.`);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: e.data,
          password,
          options: { emailRedirectTo: callbackUrl() },
        });
        if (error) {
          setErrors({ form: error.message });
          return;
        }
        if (data.session) {
          router.replace(target);
          router.refresh();
        } else {
          setMessage(`Check ${e.data} for a confirmation link to finish creating your account.`);
        }
      }
    } catch {
      setErrors({ form: GENERIC_ERROR });
    } finally {
      setPending(false);
    }
  }

  async function signInWithGoogle() {
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setErrors({ form: error.message });
      setPending(false);
    }
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: "password", label: "Password" },
    { id: "magic", label: "Email link" },
    { id: "signup", label: "New account" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {isGuest ? (
        <p className="bg-accent text-accent-foreground rounded-lg p-3 text-sm">
          You&apos;re using a guest session. Signing in to a different account switches away from
          the trips on this guest session. To keep them, use{" "}
          <a className="font-medium underline" href="/account">
            Save account
          </a>{" "}
          instead.
        </p>
      ) : null}

      <div
        role="group"
        aria-label="Sign-in method"
        className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={mode === t.id}
            onClick={() => {
              setMode(t.id);
              setErrors({});
              setMessage(null);
            }}
            className={cn(
              "h-9 rounded-md text-sm font-medium",
              mode === t.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field id="email" label="Email" error={errors.email}>
          {(aria) => (
            <Input
              {...aria}
              type="email"
              name="email"
              autoComplete={mode === "signup" ? "email" : "username"}
              inputMode="email"
              enterKeyHint={mode === "magic" ? "send" : "next"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}
        </Field>
        {mode !== "magic" ? (
          <Field
            id="password"
            label="Password"
            error={errors.password}
            hint={mode === "signup" ? "At least 8 characters." : undefined}
          >
            {(aria) => (
              <div className="relative">
                <Input
                  {...aria}
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  enterKeyHint="go"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="text-muted-foreground hover:bg-muted absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            )}
          </Field>
        ) : null}

        {errors.form ? (
          <p role="alert" className="bg-pay-bg text-pay rounded-lg p-3 text-sm">
            {errors.form}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="bg-receive-bg text-receive flex gap-2 rounded-lg p-3 text-sm">
            <Mail className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {message}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending
            ? "Please wait…"
            : mode === "password"
              ? "Sign in"
              : mode === "magic"
                ? "Email me a link"
                : "Create account"}
        </Button>
      </form>

      {googleEnabled ? (
        <>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="bg-border h-px flex-1" />
            or
            <span className="bg-border h-px flex-1" />
          </div>
          <Button variant="outline" size="lg" onClick={signInWithGoogle} disabled={pending}>
            Continue with Google
          </Button>
        </>
      ) : null}
    </div>
  );
}
