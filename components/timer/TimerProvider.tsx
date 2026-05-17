'use client';

import { ReactNode } from 'react';
import { useTimerStore, type TimerMode, type TimerStatus, type TimerTask, type NotToDoItem, type TimerState } from '@/lib/store/useTimerStore';

export type { TimerMode, TimerStatus, TimerTask, NotToDoItem, TimerState };

// Re-export useTimer as useTimerStore so any component importing useTimer gets the Zustand hook!
export const useTimer = useTimerStore;

// Passthrough TimerProvider in case any other file imports it (though removed from layout.tsx)
export function TimerProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
