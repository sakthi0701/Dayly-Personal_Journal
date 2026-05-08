import type { Metadata } from 'next';
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/SidebarProvider";
import LockProvider from "@/components/auth/LockProvider";
import MainContentWrapper from "@/components/layout/MainContentWrapper";
import { TimerProvider } from "@/components/timer/TimerProvider";
import GlobalTimerUI from "@/components/timer/GlobalTimerUI";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dayly — Active Memory Journal",
  description: "An active memory journal with deep work tracking, task management, and AI insights.",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

import NotificationManager from "@/components/layout/NotificationManager";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-zinc-950 text-white`}>
        <LockProvider>
          <TimerProvider>
            <SidebarProvider>
              {/* Persistent Left Sidebar */}
              <Sidebar />
              {/* Main content shifts based on sidebar collapsed state */}
              <MainContentWrapper>
                {children}
              </MainContentWrapper>
              {/* Global floating timer UI — persists across all pages */}
              <GlobalTimerUI />
              <NotificationManager />
            </SidebarProvider>
          </TimerProvider>
        </LockProvider>
      </body>
    </html>
  );
}

