'use client';

import { useEffect } from 'react';
import { triggerWidgetDataSync } from '@/lib/cache';

export default function WidgetSync() {
  useEffect(() => {
    // Sync data immediately on mount
    triggerWidgetDataSync();

    // Re-sync whenever the app comes back to the foreground
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerWidgetDataSync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null; // Silent global component
}
