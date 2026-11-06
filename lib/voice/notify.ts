/**
 * lib/voice/notify.ts — native (Capacitor) notification for a due Sensei call.
 *
 * Only used while the app is in the background: tapping the notification opens Dayly,
 * and the in-app scheduler sees the call is due and rings. No-ops on the web.
 */

import { isNative } from '@/lib/mobile';
import { getNextCallAt, loadCallSettings } from './settings';

const CALL_NOTIFICATION_ID = 2001;

export async function requestCallNotificationPermission(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const { display } = await LocalNotifications.requestPermissions();
    return display === 'granted';
  } catch {
    return false;
  }
}

export async function scheduleCallNotification(): Promise<void> {
  if (!isNative()) return;
  const s = loadCallSettings();
  const at = getNextCallAt();
  if (!s.enabled || !at || at <= Date.now()) return;

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    await LocalNotifications.cancel({ notifications: [{ id: CALL_NOTIFICATION_ID }] });
    await LocalNotifications.schedule({
      notifications: [{
        id: CALL_NOTIFICATION_ID,
        title: '📞 Sensei is calling',
        body: 'Your check-in is due. Tap to answer.',
        schedule: { at: new Date(at), allowWhileIdle: true },
        smallIcon: 'ic_notification',
        iconColor: '#22d3ee',
      }],
    });
  } catch (err) {
    console.warn('[Voice] Failed to schedule call notification:', err);
  }
}

export async function cancelCallNotification(): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: CALL_NOTIFICATION_ID }] });
  } catch { /* nothing scheduled */ }
}
