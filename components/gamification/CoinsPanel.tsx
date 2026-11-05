'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Shield, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';

interface ShopItem { id: string; name: string; price: number }
interface Activity { id: string; amount: number; reason: string; source: string; meta: { shielded?: boolean; blocked?: number }; created_at: string }
interface CoinsData {
  coins: number;
  shields: number;
  shieldsBoughtThisMonth: number;
  shieldPrice: number;
  rules: { missPenalty: number; failPenalty: number; maxExcusedSkips: number };
  items: ShopItem[];
  activity: Activity[];
}

export default function CoinsPanel({ onClose, onChange }: { onClose: () => void; onChange?: () => void }) {
  const [data, setData] = useState<CoinsData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const load = async () => {
    const res = await fetch('/api/coins');
    if (res.ok) setData(await res.json());
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (key: string, req: () => Promise<Response>) => {
    setBusy(key);
    setError(null);
    try {
      const res = await req();
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Something went wrong');
      }
      await load();
      onChange?.();
    } finally {
      setBusy(null);
    }
  };

  const buy = (body: object, key: string) =>
    run(key, () => fetch('/api/coins/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));

  const addItem = () => {
    const price = parseInt(newPrice, 10);
    if (!newName.trim() || !(price > 0)) return;
    run('add', () => fetch('/api/coins/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, price }),
    })).then(() => { setNewName(''); setNewPrice(''); });
  };

  const removeItem = (id: string) => run('del' + id, () => fetch(`/api/coins/items/${id}`, { method: 'DELETE' }));

  const inDebt = (data?.coins ?? 0) < 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {!data ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
        ) : (
          <>
            {/* Header */}
            <div>
              <div className="flex items-start justify-between">
                <h2 className={`text-2xl font-bold ${inDebt ? 'text-rose-400' : 'text-white'}`}>{data.coins} Coins</h2>
                <button onClick={onClose} className="text-zinc-400 hover:text-white" aria-label="Close"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-zinc-400 mt-1">
                Earned from focus sessions, tasks and journaling. Lose {data.rules.missPenalty} per check-in short of a habit&apos;s weekly goal
                and {data.rules.failPenalty} per bad-habit slip, settled Monday. Missing again the next week costs more.
              </p>
            </div>

            {inDebt && (
              <div className="flex gap-2 items-start rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                You&apos;re {-data.coins} coins in debt. The shop is locked until you earn back above zero.
              </div>
            )}

            {error && <p className="text-sm text-rose-400">{error}</p>}

            {/* Rewards */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-white">Rewards</h3>
              {data.items.length === 0 && <p className="text-xs text-zinc-500">Add something you actually want, priced so you have to earn it.</p>}
              {data.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 px-3 py-2">
                  <span className="text-sm text-zinc-200 truncate">{item.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => buy({ itemId: item.id }, item.id)}
                      disabled={busy !== null || data.coins < item.price}
                      className="rounded-lg bg-white px-3 py-1 text-sm font-medium text-zinc-900 disabled:opacity-30"
                    >
                      {busy === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : `Buy · ${item.price}`}
                    </button>
                    <button onClick={() => removeItem(item.id)} disabled={busy !== null} className="text-zinc-600 hover:text-rose-400" aria-label={`Remove ${item.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Movie night"
                  className="flex-1 min-w-0 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                />
                <input
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value.replace(/\D/g, ''))}
                  placeholder="300"
                  inputMode="numeric"
                  className="w-20 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                />
                <button onClick={addItem} disabled={busy !== null} className="rounded-xl border border-zinc-800 px-3 text-zinc-300 hover:text-white" aria-label="Add reward">
                  {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Habit Shield */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 p-3">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                  <Shield className="w-4 h-4" /> Habit Shield · {data.shieldPrice} coins
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Owned {data.shields} · bought {data.shieldsBoughtThisMonth} this month. Absorbs one habit&apos;s weekly
                  penalty automatically. Price doubles each buy, resets on the 1st.
                </p>
              </div>
              <button
                onClick={() => buy({ shield: true }, 'shield')}
                disabled={busy !== null || data.coins < data.shieldPrice}
                className="shrink-0 rounded-lg bg-white px-3 py-1 text-sm font-medium text-zinc-900 disabled:opacity-30"
              >
                {busy === 'shield' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buy'}
              </button>
            </div>

            {/* Activity */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Recent activity</h3>
              {data.activity.length === 0 && <p className="text-xs text-zinc-500">Nothing yet.</p>}
              <div className="divide-y divide-zinc-800/80 max-h-64 overflow-y-auto">
                {data.activity.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="text-zinc-200 truncate">{a.meta?.shielded ? `🛡️ ${a.reason}` : a.reason}</span>
                    <span className={`shrink-0 font-medium ${a.meta?.shielded ? 'text-zinc-500' : a.amount < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {a.meta?.shielded ? `${a.meta.blocked} blocked` : a.amount > 0 ? `+${a.amount}` : a.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
