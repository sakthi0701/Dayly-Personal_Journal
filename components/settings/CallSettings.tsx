"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { PhoneCall, Check, Phone } from 'lucide-react';
import {
  CALL_NOW_EVENT, DEFAULT_CALL_SETTINGS, callSettingsSnapshot, getNextCallAt, loadCallSettings, saveCallSettings,
  subscribeCallSettings, type CallSettings as Settings,
} from '@/lib/voice/settings';
import {
  getExactAlarmStatus, hasCallNotificationPermission, openExactAlarmSetting, requestCallNotificationPermission,
  syncCallNotifications,
} from '@/lib/voice/notify';

const INTERVALS = [30, 45, 60, 90, 120, 180];
const HOURS = Array.from({ length: 25 }, (_, h) => h);

const intervalLabel = (m: number) => (m < 60 ? `${m}m` : `${m / 60}h`.replace('.5h', '½h'));
const hourLabel = (h: number) =>
  h === 0 || h === 24 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`;

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-cyan-500' : 'bg-zinc-700'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export default function CallSettings() {
  // localStorage is the source of truth; '' on the server so SSR renders defaults without a mismatch
  const snap = useSyncExternalStore(subscribeCallSettings, callSettingsSnapshot, () => '');
  const s = useMemo<Settings>(() => (snap ? loadCallSettings() : DEFAULT_CALL_SETTINGS), [snap]);
  const nextAt = useMemo(() => (snap ? getNextCallAt() : null), [snap]);
  const [showSaved, setShowSaved] = useState(false);
  const [notifDenied, setNotifDenied] = useState(false);
  // Background-ringing readiness: null = still checking
  const [notifOk, setNotifOk] = useState<boolean | null>(null);
  const [exact, setExact] = useState<'granted' | 'denied' | 'n/a' | null>(null);

  const refreshStatus = useCallback(() => {
    void hasCallNotificationPermission().then(setNotifOk);
    void getExactAlarmStatus().then(setExact);
  }, []);

  useEffect(() => {
    refreshStatus();
    // Returning from Android's settings screen → re-check what was granted
    window.addEventListener('focus', refreshStatus);
    document.addEventListener('visibilitychange', refreshStatus);
    return () => {
      window.removeEventListener('focus', refreshStatus);
      document.removeEventListener('visibilitychange', refreshStatus);
    };
  }, [refreshStatus]);

  const askNotifications = async () => {
    const ok = await requestCallNotificationPermission();
    setNotifDenied(!ok);
    setNotifOk(ok);
    if (ok) await syncCallNotifications(); // arm alarms now that we're allowed to
  };

  const update = async (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    if (next.endHour <= next.startHour) return; // keep the window valid
    saveCallSettings(next); // fires CALL_SETTINGS_EVENT → re-render via useSyncExternalStore
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
    if (patch.enabled) await askNotifications();
  };

  return (
    <section className="relative bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 lg:p-8 mt-8">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg">
            <PhoneCall className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Jarvis Check-in Calls</h2>
            <p className="text-sm text-zinc-400">Jarvis calls you, asks how your tasks are going, and updates them as you talk</p>
          </div>
        </div>
        {showSaved && (
          // Absolute so the badge doesn't squeeze the long title on phone widths
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium rounded-lg">
            <Check className="w-3.5 h-3.5" /> Saved
          </div>
        )}
      </div>

      <div className="space-y-6 max-w-xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-sm">Scheduled calls</p>
            <p className="text-xs text-zinc-500">
              {s.enabled && nextAt
                ? `Next call ${new Date(nextAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
                : 'Off — replaces the hourly check-in popup when on'}
            </p>
          </div>
          <Toggle on={s.enabled} onChange={(v) => update({ enabled: v })} label="Scheduled calls" />
        </div>

        {notifDenied && (
          <p className="text-xs text-amber-400">
            Notifications are blocked, so calls will only ring while Dayly is open. Allow notifications for Dayly in your device or browser settings.
          </p>
        )}

        {s.enabled && notifOk !== null && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
            <p className="font-semibold text-sm">Ringing while Dayly is closed</p>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-400">{exact === 'n/a' ? 'Notifications (tab must stay open)' : 'Call notifications'}</span>
              {notifOk ? (
                <span className="flex items-center gap-1 text-emerald-400 text-xs"><Check className="w-3.5 h-3.5" /> On</span>
              ) : (
                <button onClick={askNotifications} className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
                  Allow
                </button>
              )}
            </div>
            {exact !== 'n/a' && exact !== null && (
              <div className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <span className="text-zinc-400">Exact timing</span>
                  {exact === 'denied' && <p className="text-[11px] text-zinc-500">Without it Android may ring a few minutes late</p>}
                </div>
                {exact === 'granted' ? (
                  <span className="flex items-center gap-1 text-emerald-400 text-xs"><Check className="w-3.5 h-3.5" /> On</span>
                ) : (
                  <button onClick={() => void openExactAlarmSetting()} className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
                    Allow
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className={s.enabled ? '' : 'opacity-50 pointer-events-none'}>
          <p className="font-semibold text-sm mb-2">Call every</p>
          <div className="flex flex-wrap gap-2">
            {INTERVALS.map((m) => (
              <button
                key={m}
                onClick={() => update({ intervalMin: m })}
                className={`px-3.5 py-1.5 rounded-lg text-sm border transition-all ${
                  s.intervalMin === m
                    ? 'bg-cyan-500/10 border-cyan-500 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                {intervalLabel(m)}
              </button>
            ))}
          </div>

          <p className="font-semibold text-sm mt-6 mb-2">Only between</p>
          <div className="flex items-center gap-3 text-sm">
            <select
              value={s.startHour}
              onChange={(e) => update({ startHour: Number(e.target.value) })}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200"
              aria-label="Calls start at"
            >
              {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
            <span className="text-zinc-500">and</span>
            <select
              value={s.endHour}
              onChange={(e) => update({ endHour: Number(e.target.value) })}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200"
              aria-label="Calls stop at"
            >
              {HOURS.slice(1).map((h) => <option key={h} value={h} disabled={h <= s.startHour}>{hourLabel(h)}</option>)}
            </select>
          </div>

          <div className="flex items-center justify-between gap-4 mt-6">
            <div>
              <p className="font-semibold text-sm">Don&apos;t call during focus</p>
              <p className="text-xs text-zinc-500">Waits until your Pomodoro ends</p>
            </div>
            <Toggle on={s.skipDuringFocus} onChange={(v) => update({ skipDuringFocus: v })} label="Don't call during focus" />
          </div>
        </div>

        <button
          onClick={() => window.dispatchEvent(new Event(CALL_NOW_EVENT))}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-sm font-semibold hover:bg-cyan-500/20 transition-colors"
        >
          <Phone className="w-4 h-4" /> Call me now
        </button>
      </div>
    </section>
  );
}
