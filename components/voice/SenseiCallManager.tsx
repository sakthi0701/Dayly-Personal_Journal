'use client';

/**
 * Global Sensei call scheduler. Mounted once in the root layout.
 *
 * - Polls every 20s; when the next call is due (and inside active hours, and no focus
 *   session is running) it rings.
 * - Decline / finished → next call after the interval; snooze → after the chosen minutes;
 *   unanswered → retry in 15 min.
 * - On Android, when the app goes to the background a local notification is scheduled for
 *   the next call; coming back to the foreground cancels it (the in-app ring takes over).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import CallScreen, { type CallPhase } from './CallScreen';
import { useTimerStore } from '@/lib/store/useTimerStore';
import { isNative } from '@/lib/mobile';
import {
  CALL_NOW_EVENT, CALL_SETTINGS_EVENT, alignToWindow, getNextCallAt, loadCallSettings, scheduleCallIn, setNextCallAt,
} from '@/lib/voice/settings';
import { cancelCallNotification, scheduleCallNotification } from '@/lib/voice/notify';

const POLL_MS = 20_000;
const MISSED_RETRY_MIN = 15;
const FOCUS_RETRY_MIN = 10;

function isFocusRunning(): boolean {
  const { status, isBreak } = useTimerStore.getState();
  return status === 'running' && !isBreak;
}

/** Reschedule only while calls are enabled (a manual "Call me now" mustn't arm the schedule). */
function rescheduleIn(minutes: number) {
  const s = loadCallSettings();
  if (s.enabled) scheduleCallIn(minutes, s);
}

export default function SenseiCallManager() {
  const [phase, setPhase] = useState<CallPhase | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const check = useCallback(() => {
    if (phaseRef.current) return;
    const s = loadCallSettings();
    if (!s.enabled) return;

    const next = getNextCallAt();
    if (next === null) {
      scheduleCallIn(s.intervalMin, s);
      return;
    }
    const now = Date.now();
    if (now < next) return;

    const aligned = alignToWindow(now, s);
    if (aligned > now) {
      setNextCallAt(aligned); // quiet hours — wait for the window to open
      return;
    }
    if (s.skipDuringFocus && isFocusRunning()) {
      scheduleCallIn(FOCUS_RETRY_MIN, s); // never interrupt deep work
      return;
    }
    setPhase('ringing');
  }, []);

  // Poll + react to settings changes / "Call me now"
  useEffect(() => {
    const init = setTimeout(check, 3000); // let the app hydrate first
    const id = setInterval(check, POLL_MS);
    const callNow = () => { if (!phaseRef.current) setPhase('call'); };
    window.addEventListener(CALL_SETTINGS_EVENT, check);
    window.addEventListener(CALL_NOW_EVENT, callNow);
    return () => {
      clearTimeout(init);
      clearInterval(id);
      window.removeEventListener(CALL_SETTINGS_EVENT, check);
      window.removeEventListener(CALL_NOW_EVENT, callNow);
    };
  }, [check]);

  // Android: notification while backgrounded, in-app ring while foregrounded
  useEffect(() => {
    if (!isNative()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          void cancelCallNotification();
          check();
        } else if (!phaseRef.current) {
          void scheduleCallNotification();
        }
      });
      if (cancelled) handle.remove();
      else remove = () => handle.remove();
    })();
    return () => { cancelled = true; remove?.(); };
  }, [check]);

  const close = useCallback((nextInMin: number) => {
    setPhase(null);
    rescheduleIn(nextInMin);
  }, []);

  if (!phase) return null;
  const interval = loadCallSettings().intervalMin;

  return (
    <CallScreen
      phase={phase}
      onAccept={() => setPhase('call')}
      onDecline={() => close(interval)}
      onSnooze={(m) => close(m)}
      onMissed={() => close(MISSED_RETRY_MIN)}
      onFinished={() => close(interval)}
    />
  );
}
