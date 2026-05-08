/**
 * lib/mobile.ts — Mobile/Capacitor runtime utilities
 *
 * Detects whether the app is running inside a Capacitor native shell
 * vs a regular browser. Use this to conditionally apply native behaviors.
 */

import { Capacitor } from '@capacitor/core';

/** True when running inside the Android (or iOS) Capacitor shell */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/** True when running on Android specifically */
export const isAndroid = (): boolean => Capacitor.getPlatform() === 'android';

/** True when running in a regular browser */
export const isWeb = (): boolean => Capacitor.getPlatform() === 'web';

/**
 * Initialize native UI chrome.
 * Call once in your root layout on mount.
 *
 * - Sets status bar to dark/transparent (matches Dayly dark theme)
 * - Hides the splash screen after the app is ready
 */
export async function initNativeUI(): Promise<void> {
  if (!isNative()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0d0d1a' });
  } catch (err) {
    console.warn('[Mobile] StatusBar init failed:', err);
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch (err) {
    console.warn('[Mobile] SplashScreen hide failed:', err);
  }
}

/**
 * Schedule a local streak reminder notification.
 * Call after loading user stats if streak > 0.
 *
 * @param streakDays Current streak to display in the notification
 * @param reminderHour 24h hour to send the reminder (default: 21 = 9pm)
 */
export async function scheduleStreakReminder(
  streakDays: number,
  reminderHour = 21
): Promise<void> {
  if (!isNative()) return;

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');

    // Request permission first (required on Android 13+)
    const { display } = await LocalNotifications.requestPermissions();
    if (display !== 'granted') return;

    // Cancel existing streak reminders before rescheduling
    await LocalNotifications.cancel({ notifications: [{ id: 1001 }] });

    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(reminderHour, 0, 0, 0);
    // If today's reminder time has passed, schedule for tomorrow
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: 1001,
          title: streakDays > 0 ? `🔥 ${streakDays}-day streak at risk!` : '📓 Journal today',
          body:
            streakDays > 0
              ? `Don't let your ${streakDays}-day Sun Warrior streak break. Write something, anything.`
              : "Your future self is waiting. Open Dayly and write one sentence.",
          schedule: {
            at: scheduled,
            repeats: true,
            every: 'day',
          },
          smallIcon: 'ic_notification',
          iconColor: '#FFD700',
        },
      ],
    });
  } catch (err) {
    console.warn('[Mobile] Failed to schedule streak reminder:', err);
  }
}

/**
 * Listen for the app coming back to foreground.
 * Use to trigger cache revalidation without a full page refresh.
 *
 * @param onResume Callback fired when app returns from background
 */
export async function onAppResume(onResume: () => void): Promise<() => void> {
  if (!isNative()) return () => {};

  const { App } = await import('@capacitor/app');
  const handle = await App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) onResume();
  });

  // Return cleanup function
  return () => handle.remove();
}
