import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/features/trips/queries";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={className}>
      <svg viewBox="0 0 64 64" aria-hidden="true" className="inline size-7 align-[-7px]">
        <rect width="64" height="64" rx="14" fill="#0f766e" />
        <path d="M30.4 12.8a19.2 19.2 0 0 0 0 38.4z" fill="#fff" />
        <path d="M33.6 12.8a19.2 19.2 0 0 1 0 38.4z" fill="#99f6e4" />
      </svg>{" "}
      <span className="font-semibold tracking-tight">Trip Split</span>
    </span>
  );
}

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="bg-card/80 supports-[backdrop-filter]:bg-card/70 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" className="rounded-md text-base">
          <Logo />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-1 text-sm">
          {user && !user.isAnonymous ? (
            <Link
              href="/account"
              className="hover:bg-muted flex items-center gap-1.5 rounded-lg px-3 py-2"
            >
              <CircleUserRound className="size-4" aria-hidden="true" />
              <span className="max-w-[12rem] truncate">{user.email ?? "Account"}</span>
            </Link>
          ) : user?.isAnonymous ? (
            <Link href="/account" className="hover:bg-muted rounded-lg px-3 py-2">
              Guest · <span className="text-primary font-medium">Save account</span>
            </Link>
          ) : (
            <Link href="/login" className="hover:bg-muted rounded-lg px-3 py-2 font-medium">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
