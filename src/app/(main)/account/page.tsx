import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { SaveAccountForm, SignOutButton } from "@/features/auth/components/account-forms";
import { getCurrentUser } from "@/features/trips/queries";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-muted-foreground">You&apos;re not signed in.</p>
        <Link href="/login" className={buttonVariants()}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      {user.isAnonymous ? (
        <>
          <Panel className="flex flex-col gap-2">
            <h2 className="font-semibold">You&apos;re using a guest session</h2>
            <p className="text-muted-foreground text-sm">
              Your trips are linked to this browser. Add an email and password to keep access if you
              clear your browser or switch phones. Nothing else changes.
            </p>
          </Panel>
          <Panel>
            <SaveAccountForm />
          </Panel>
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              Signing out of a guest session removes access to its trips on this device unless you
              rejoin with the trip codes.
            </p>
            <SignOutButton />
          </div>
        </>
      ) : (
        <Panel className="flex flex-col gap-4">
          <div>
            <p className="text-muted-foreground text-sm">Signed in as</p>
            <p className="font-medium">{user.email}</p>
          </div>
          <SignOutButton />
        </Panel>
      )}
      <p className="text-muted-foreground text-xs">
        Trip Split never stores bank, card or UPI details and never processes payments.
      </p>
    </div>
  );
}
