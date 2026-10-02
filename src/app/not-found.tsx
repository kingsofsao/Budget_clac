import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <span className="bg-muted flex size-14 items-center justify-center rounded-full">
        <SearchX className="size-7" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">It may have been deleted, or the link is incomplete.</p>
      <Link href="/" className={buttonVariants()}>
        Go to my trips
      </Link>
    </main>
  );
}
