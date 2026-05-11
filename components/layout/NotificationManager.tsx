'use client';

import { useEffect } from 'react';

// ── Message banks (Duolingo-style: urgent, personal, specific) ────────────────

const MORNING_NUDGES = [
  "🌅 Morning! A 25-min session before 10am builds unstoppable momentum.",
  "☀️ Your streak is counting on you. One Pomodoro is all it takes.",
  "🍅 Top performers start focused. Start yours now.",
];

const AFTERNOON_PUSHES = [
  "⚔️ Halfway through the day. What have you actually shipped?",
  "🔥 Your streak is alive — don't let today be the day it dies.",
  "📊 One focused session beats three hours of distracted work. Go.",
  "⏳ 4 hours left in the workday. Make at least one of them count.",
];

const EVENING_WARNINGS = [
  "🚨 STREAK AT RISK! You haven't focused yet today. Do it now!",
  "😤 Don't let today be a zero day. 25 minutes. That's it.",
  "🌙 Last chance! Your streak ends at midnight. One session. Go.",
  "❌ Giving up is easy. Opening the app is hard. You opened it before. Do it again.",
];

const STREAK_LOSS_FEAR = [
  "💀 Miss today = streak gone. All those days. Gone. Don't.",
  "😰 You've come too far to quit now. ONE Pomodoro. NOW.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getMotivationalMessage(hour: number, streakDays: number): { title: string; body: string } {
  const streakLine = streakDays > 0 ? ` (${streakDays}-day streak)` : '';

  if (hour < 11) {
    return { title: `Dayly${streakLine}`, body: pick(MORNING_NUDGES) };
  } else if (hour < 17) {
    return { title: `Dayly${streakLine}`, body: pick(AFTERNOON_PUSHES) };
  } else if (hour < 21) {
    return { title: `⚠️ Dayly${streakLine}`, body: pick(EVENING_WARNINGS) };
  } else {
    return { title: `🚨 Dayly${streakLine}`, body: pick(STREAK_LOSS_FEAR) };
  }
}

// ── Web push (browser Notification API) ──────────────────────────────────────
function scheduleWebReminder(streakDays: number) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  const hour = now.getHours();

  // Only nudge if it's between 8am and 10pm
  if (hour < 8 || hour >= 22) return;

  // Check if we already sent a notification this session (persisted via sessionStorage)
  const lastNotifKey = 'dayly_last_notif_date';
  const today = now.toISOString().slice(0, 10);
  const lastDate = sessionStorage.getItem(lastNotifKey);
  if (lastDate === today) return; // already notified today in this browser session

  sessionStorage.setItem(lastNotifKey, today);

  // Schedule based on time-of-day escalation
  const delays = hour < 11
    ? [0]                        // morning: fire once immediately
    : hour < 17
    ? [0, 3 * 60 * 60 * 1000]   // afternoon: fire now + in 3hrs
    : [0, 60 * 60 * 1000];      // evening: fire now + in 1hr (urgency)

  delays.forEach((delay) => {
    setTimeout(() => {
      // Re-check permission (could have been revoked)
      if (Notification.permission !== 'granted') return;
      const { title, body } = getMotivationalMessage(new Date().getHours(), streakDays);
      const n = new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'dayly-daily-nudge', // prevents notification spam (replaces previous)
        requireInteraction: new Date().getHours() >= 20, // sticky at night
      });
      n.onclick = () => { window.focus(); n.close(); };
    }, delay);
  });
}

// ── Native (Capacitor) push ───────────────────────────────────────────────────
async function scheduleNativeReminders(streakDays: number) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');

  const res = await LocalNotifications.requestPermissions();
  if (res.display !== 'granted') return;

  // Cancel previous nudges
  const cancelIds = [42, 43, 44, 45, 46, 47];
  await LocalNotifications.cancel({ notifications: cancelIds.map((id) => ({ id })) });

  const now = new Date();
  const hour = now.getHours();

  const scheduledNotifs = [];

  // If before 11am: schedule afternoon + evening nudges today, morning tomorrow
  // If 11am-5pm: schedule evening nudge today + morning + afternoon tomorrow
  // If after 5pm: schedule evening nudge now, morning tomorrow

  const targets: { daysFromNow: number; h: number; m: number; id: number }[] = [];

  if (hour < 11) {
    targets.push(
      { daysFromNow: 0, h: 14, m: 0, id: 42 },   // 2pm today
      { daysFromNow: 0, h: 20, m: 0, id: 43 },   // 8pm today
    );
  } else if (hour < 17) {
    targets.push(
      { daysFromNow: 0, h: 20, m: 0, id: 43 },   // 8pm today
    );
  }

  // Always schedule 3 days ahead (morning + evening)
  for (let i = 1; i <= 3; i++) {
    targets.push({ daysFromNow: i, h: 9, m: 0, id: 44 + (i - 1) * 2 });
    targets.push({ daysFromNow: i, h: 20, m: 0, id: 45 + (i - 1) * 2 });
  }

  for (const t of targets) {
    const d = new Date();
    d.setDate(d.getDate() + t.daysFromNow);
    d.setHours(t.h, t.m, 0, 0);
    if (d <= now) continue; // don't schedule in the past

    const { title, body } = getMotivationalMessage(t.h, streakDays);
    scheduledNotifs.push({ title, body, id: t.id, schedule: { at: d } });
  }

  if (scheduledNotifs.length > 0) {
    await LocalNotifications.schedule({ notifications: scheduledNotifs }).catch(console.error);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function NotificationManager() {
  useEffect(() => {
    // Fetch streak + check if user focused today before scheduling
    Promise.all([
      fetch('/api/stats/user').then((r) => r.json()).catch(() => ({ stats: null })),
      fetch('/api/stats/pomodoro').then((r) => r.json()).catch(() => null),
    ]).then(async ([statsData, pomodoroData]) => {
      const streakDays = statsData?.stats?.streak_days ?? 0;
      const focusedToday = (pomodoroData?.todayFocusMinutes ?? 0) > 0;

      // If user already focused today → don't bug them
      if (focusedToday) return;

      import('@capacitor/core').then(({ Capacitor }) => {
        if (Capacitor.isNativePlatform()) {
          scheduleNativeReminders(streakDays);
        } else {
          scheduleWebReminder(streakDays);
        }
      });
    });
  }, []);

  return null;
}
