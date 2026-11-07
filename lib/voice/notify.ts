/**
 * lib/voice/notify.ts — system notifications for due Jarvis calls.
 *
 * Android (Capacitor): the next 24h of calls are PRE-SCHEDULED as native alarms whenever the
 * schedule changes. Don't go back to "schedule one notification when the app goes to the
 * background": that ran in a WebView Android was already pausing, armed only one call, and
 * calls silently stopped until the app was reopened (real bug, Nov 2026).
 *
 * Web: browsers can't run anything once the tab is closed. While the tab is open but hidden,
 * showRingNotification() raises a system notification so the ring isn't missed.
 */

import { isNative } from '@/lib/mobile';
import { getNextCallAt, loadCallSettings, upcomingCallSlots } from './settings';

/** IDs 2001..2024 are reserved for call slots (1001 = streak reminder, untouched). */
const FIRST_ID = 2001;
const MAX_SLOTS = 24;
const SLOT_IDS = Array.from({ length: MAX_SLOTS }, (_, i) => ({ id: FIRST_ID + i }));
/** Extra marks a notification as a call so a tap answers it. */
export const CALL_NOTIFICATION_KIND = 'jarvis-call';
const CHANNEL_ID = 'jarvis-calls';

let channelReady = false;

async function getPlugin() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return LocalNotifications;
}

/** Heads-up, sound, vibration, visible on the lock screen. Channels are immutable once created on Android. */
async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  const LN = await getPlugin();
  await LN.createChannel({
    id: CHANNEL_ID,
    name: 'Jarvis calls',
    description: 'Scheduled check-in calls from Jarvis',
    importance: 5,   // IMPORTANCE_HIGH/MAX → heads-up popup
    visibility: 1,   // public on the lock screen
    vibration: true,
    lights: true,
    lightColor: '#22D3EE',
  });
  channelReady = true;
}

export async function requestCallNotificationPermission(): Promise<boolean> {
  if (!isNative()) {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    return (await Notification.requestPermission()) === 'granted';
  }
  try {
    const { display } = await (await getPlugin()).requestPermissions();
    return display === 'granted';
  } catch {
    return false;
  }
}

export async function hasCallNotificationPermission(): Promise<boolean> {
  if (!isNative()) return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  try {
    return (await (await getPlugin()).checkPermissions()).display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Re-arm all native call alarms from the current schedule. Call whenever the schedule changes
 * (and on app start/resume). Cancelling also clears any already-delivered call notification.
 */
export async function syncCallNotifications(): Promise<void> {
  if (!isNative()) return;
  try {
    const LN = await getPlugin();
    await LN.cancel({ notifications: SLOT_IDS });

    const s = loadCallSettings();
    const next = getNextCallAt();
    if (!s.enabled || next === null) return;
    if ((await LN.checkPermissions()).display !== 'granted') return;

    await ensureChannel();
    const slots = upcomingCallSlots(next, s, 24 * 3_600_000, MAX_SLOTS);
    if (!slots.length) return;

    await LN.schedule({
      notifications: slots.map((at, i) => ({
        id: FIRST_ID + i,
        title: '📞 Jarvis is calling',
        body: 'Your check-in is due. Tap to answer.',
        channelId: CHANNEL_ID,
        schedule: { at: new Date(at), allowWhileIdle: true },
        smallIcon: 'ic_notification',
        iconColor: '#22d3ee',
        autoCancel: true,
        extra: { kind: CALL_NOTIFICATION_KIND },
      })),
    });
  } catch (err) {
    console.warn('[Voice] Failed to sync call notifications:', err);
  }
}

/** Remove call notifications already sitting in the tray (the in-app ring has taken over). */
export async function clearDeliveredCallNotifications(): Promise<void> {
  if (!isNative()) return;
  try {
    const LN = await getPlugin();
    const { notifications } = await LN.getDeliveredNotifications();
    const ours = notifications.filter((n) => n.id >= FIRST_ID && n.id < FIRST_ID + MAX_SLOTS);
    if (ours.length) await LN.removeDeliveredNotifications({ notifications: ours });
  } catch { /* nothing delivered */ }
}

/** Android 12+: exact alarms need a user-granted setting; without it calls may fire a few minutes late. */
export async function getExactAlarmStatus(): Promise<'granted' | 'denied' | 'n/a'> {
  if (!isNative()) return 'n/a';
  try {
    const { exact_alarm } = await (await getPlugin()).checkExactNotificationSetting();
    return exact_alarm === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'n/a';
  }
}

export async function openExactAlarmSetting(): Promise<void> {
  if (!isNative()) return;
  try { await (await getPlugin()).changeExactNotificationSetting(); } catch { /* unsupported */ }
}

/** Web only: a system notification while the tab is hidden, so a ring isn't missed. */
export function showRingNotification(): () => void {
  if (isNative() || typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) {
    return () => {};
  }
  const n = new Notification('📞 Jarvis is calling', {
    body: 'Your check-in is due. Click to answer.',
    tag: CALL_NOTIFICATION_KIND,
    requireInteraction: true,
    icon: '/favicon.ico',
  });
  n.onclick = () => { window.focus(); n.close(); };
  return () => n.close();
}
