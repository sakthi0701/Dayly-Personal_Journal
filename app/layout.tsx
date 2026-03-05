import type { Metadata } from 'next';
import { Inter } from "next/font/google";
import "./globals.css";
import Link from 'next/link';

import GamificationNavbar from "@/components/GamificationNavbar";
import LockProvider from "@/components/auth/LockProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dayly",
  description: "Active Memory Journal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-zinc-950 text-white`}>
        <LockProvider>
          {/* Global Navigation Bar */}
          <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/50">
            <Link href="/" className="flex items-center gap-2 text-white font-bold text-lg tracking-tight hover:opacity-80 transition-opacity">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-indigo-400">
                <rect x="4" y="2" width="16" height="4" rx="1" fill="currentColor" opacity="0.3" />
                <rect x="5" y="7" width="14" height="4" rx="1" fill="currentColor" opacity="0.6" />
                <rect x="6" y="12" width="12" height="4" rx="1" fill="currentColor" opacity="0.8" />
                <rect x="7" y="17" width="10" height="4" rx="1" fill="currentColor" />
              </svg>
              Dayly
            </Link>
            <GamificationNavbar />
          </nav>

          {/* Main content with top padding for fixed nav */}
          <div className="pt-14">
            {children}
          </div>
        </LockProvider>
      </body>
    </html>
  );
}
