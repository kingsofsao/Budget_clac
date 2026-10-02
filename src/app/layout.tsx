import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Trip Split — split group trip expenses", template: "%s · Trip Split" },
  description:
    "Split expenses for group outings and trips. See who paid what, everyone's share, and who owes whom. No payments — just clear numbers.",
  applicationName: "Trip Split",
  appleWebApp: { capable: true, title: "Trip Split", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={inter.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <a
          href="#main"
          className="bg-primary text-primary-foreground sr-only z-[100] rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        {children}
        <Toaster position="top-center" richColors closeButton />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
