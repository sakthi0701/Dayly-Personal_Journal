'use client';

/**
 * Global Jarvis call scheduler. Mounted once in the root layout.
 *
 * - Polls every 20s; when the next call is due (and inside active hours, and no focus
 *   session is running) it rings.
 * - Decline / finished → next call after the interval; snooze → after the chosen minutes;
 *   unanswered → retry in 15 min.
 * - On Android the next 24h of calls are pre-armed as native alarms (lib/voice/notify.ts), so
 *   they ring with the app closed; tapping one answers. Opening the app late skips stale calls.
 * - On the web, a hidden tab gets a system notification when it rings (a closed tab can't ring).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import CallScreen, { type CallPhase } from './CallScreen';
import { useTimerStore } from '@/lib/store/useTimerStore';
import { isNative } from '@/lib/mobile';
import {
  CALL_NOW_EVENT, CALL_SETTINGS_EVENT, alignToWindow, getNextCallAt, loadCallSettings, scheduleCallIn, setNextCallAt,
  upcomingCallSlots,
} from '@/lib/voice/settings';
import {
  CALL_NOTIFICATION_KIND, clearDeliveredCallNotifications, showRingNotification, syncCallNotifications,
} from '@/lib/voice/notify';

const POLL_MS = 20_000;
const MISSED_RETRY_MIN = 15;
const FOCUS_RETRY_MIN = 10;
/**
 * A call overdue by more than this was missed while the app was closed. Opening the app then
 * skips to the next slot instead of ringing instantly (user found "rings the moment I open it"
 * jarring). Tapping the call notification still answers immediately.
 */
const STALE_MS = 10 * 60_000;

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

    if (now - next > STALE_MS) {
      setNextCallAt(upcomingCallSlots(next, s, 48 * 3_600_000, 1)[0] ?? alignToWindow(now + s.intervalMin * 60_000, s));
      return;
    }

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

  // Android: keep the next 24h of calls armed as native alarms (they fire with the app closed)
  useEffect(() => {
    if (!isNative()) return;
    void syncCallNotifications();
    const resync = () => void syncCallNotifications();
    window.addEventListener(CALL_SETTINGS_EVENT, resync);

    const removers: (() => void)[] = [];
    let cancelled = false;
    (async () => {
      const { App } = await import('@capacitor/app');
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const handles = await Promise.all([
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) { check(); resync(); }
        }),
        // Tapping a call notification = answering it, even if the slot is "stale"
        LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
          if (notification.extra?.kind === CALL_NOTIFICATION_KIND && !phaseRef.current) setPhase('call');
        }),
      ]);
      if (cancelled) handles.forEach((h) => h.remove());
      else removers.push(...handles.map((h) => () => h.remove()));
    })();

    return () => {
      cancelled = true;
      window.removeEventListener(CALL_SETTINGS_EVENT, resync);
      removers.forEach((r) => r());
    };
  }, [check]);

  // While ringing: drop the tray copy on Android; raise a system notification on a hidden web tab
  useEffect(() => {
    if (phase !== 'ringing') return;
    void clearDeliveredCallNotifications();
    return showRingNotification();
  }, [phase]);

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
