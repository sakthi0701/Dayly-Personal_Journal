'use client';

import { useSidebar } from './SidebarProvider';
import { ReactNode } from 'react';

export default function MainContentWrapper({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={`min-h-screen transition-all duration-300 ${
        collapsed ? 'pl-[68px]' : 'pl-64'
      }`}
      id="main-content"
    >
      {children}
    </div>
  );
}
