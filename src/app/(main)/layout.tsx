import { SiteHeader } from "@/components/site-header";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 sm:pt-10">
        {children}
      </main>
    </>
  );
}
