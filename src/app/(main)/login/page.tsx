import type { Metadata } from "next";
import { Panel } from "@/components/common";
import { LoginForm } from "@/features/auth/components/login-form";
import { getCurrentUser } from "@/features/trips/queries";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  const next = typeof params.next === "string" ? params.next : null;
  const authError = params.error === "auth";
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground">
          An account keeps your trips available on every device. It&apos;s optional: you can create
          and join trips as a guest.
        </p>
      </div>
      {authError ? (
        <p role="alert" className="bg-pay-bg text-pay rounded-lg p-3 text-sm">
          That sign-in link is invalid or has expired. Please try again.
        </p>
      ) : null}
      <Panel>
        <LoginForm
          next={next}
          googleEnabled={process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true"}
          isGuest={Boolean(user?.isAnonymous)}
        />
      </Panel>
    </div>
  );
}
