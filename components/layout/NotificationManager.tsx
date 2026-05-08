'use client';

import { useEffect } from 'react';

export default function NotificationManager() {
  useEffect(() => {
    import('@capacitor/core').then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;

      import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
        LocalNotifications.requestPermissions().then((res) => {
          if (res.display === 'granted') {
            // Cancel existing streak reminders so we don't spam if they already opened the app today
            LocalNotifications.cancel({ notifications: [{ id: 42 }, { id: 43 }, { id: 44 }] });

            // Schedule reminders for the next 3 days at 8:00 PM local time
            const notifs = [];
            for (let i = 1; i <= 3; i++) {
              const d = new Date();
              d.setDate(d.getDate() + i);
              d.setHours(20, 0, 0, 0); // 8:00 PM
              
              const messages = [
                "It's time for your daily focus session! Keep the streak alive! 🔥",
                "Your Dayly streak is in danger! Jump in now! ⚔️",
                "Don't lose your progress! Just a quick journal entry is all it takes! ☀️"
              ];

              notifs.push({
                title: 'Dayly Reminder',
                body: messages[i - 1],
                id: 41 + i,
                schedule: { at: d },
              });
            }
            LocalNotifications.schedule({ notifications: notifs }).catch(console.error);
          }
        });
      });
    });
  }, []);

  return null;
}
