'use client';

import Link from 'next/link';
import { useSidebar } from './SidebarProvider';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Flame,
  Timer,
  Brain,
  Swords,
  Settings,
  Coins,
} from 'lucide-react';
import MiniPlayer from '@/components/timer/MiniPlayer';
import CoinsPanel from '@/components/gamification/CoinsPanel';

interface UserStats {
  streak_days: number;
  coins: number;
  current_avatar_state: string;
}

const NAV_ITEMS = [
  { href: '/',        icon: LayoutDashboard, label: 'Overview' },
  { href: '/action',  icon: Swords,          label: 'Action'   },
  { href: '/focus',   icon: Timer,           label: 'Focus'    },
  { href: '/entries', icon: BookOpen,        label: 'Journal'  },
  { href: '/sensei',  icon: Brain,           label: 'Sensei'   },
  { href: '/settings', icon: Settings,       label: 'Settings' },
];


export default function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed } = useSidebar();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [coinsOpen, setCoinsOpen] = useState(false);

  const loadStats = () => {
    fetch('/api/stats/user')
      .then((r) => r.json())
      .then((data) => {
        if (data?.stats) setStats(data.stats);
      })
      .catch(() => null);
  };

  useEffect(loadStats, []);

  const coins = stats?.coins ?? 0;
  const streak = stats?.streak_days ?? 0;

  return (
    <aside
      className={`fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-300 ease-in-out
        bg-zinc-950 border-r border-zinc-800/60
        ${collapsed ? 'w-[68px]' : 'w-64'}`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-4 border-b border-zinc-800/60 ${collapsed ? 'justify-center' : ''}`}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-indigo-400 shrink-0">
          <rect x="4" y="2" width="16" height="4" rx="1" fill="currentColor" opacity="0.3" />
          <rect x="5" y="7" width="14" height="4" rx="1" fill="currentColor" opacity="0.6" />
          <rect x="6" y="12" width="12" height="4" rx="1" fill="currentColor" opacity="0.8" />
          <rect x="7" y="17" width="10" height="4" rx="1" fill="currentColor" />
        </svg>
        {!collapsed && (
          <span className="text-white font-bold text-lg tracking-tight">Dayly</span>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 flex flex-col gap-1 px-2 py-4 overflow-y-auto">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                ${isActive
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'}
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* MiniPlayer — Spotify-style persistent timer */}
      <MiniPlayer collapsed={collapsed} />

      {/* Bottom Anchor — Streak & Coins */}
      <div className="border-t border-zinc-800/60 px-3 py-4">
        {!collapsed ? (
          <div className="space-y-3">
            {/* Streak */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className={`w-4 h-4 ${streak > 0 ? 'text-orange-400' : 'text-zinc-600'}`} />
                <span className="text-xs text-zinc-400">
                  {streak > 0 ? `${streak} day streak` : 'No streak yet'}
                </span>
              </div>
            </div>

            {/* Coins — spendable balance, opens the shop */}
            <button
              onClick={() => setCoinsOpen(true)}
              className="w-full flex items-center justify-between rounded-lg px-2 py-1.5 -mx-2 hover:bg-zinc-800/60 transition-colors"
            >
              <span className="flex items-center gap-2 text-xs text-zinc-400">
                <Coins className="w-4 h-4 text-amber-400" />
                Coins
              </span>
              <span className={`text-xs font-semibold ${coins < 0 ? 'text-rose-400' : 'text-amber-300'}`}>{coins}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-500/10 border border-orange-500/20">
              <Flame className={`w-4 h-4 ${streak > 0 ? 'text-orange-400' : 'text-zinc-600'}`} />
            </div>
            <span className="text-xs text-zinc-600">{streak}d</span>
            <button
              onClick={() => setCoinsOpen(true)}
              title={`${coins} coins`}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20"
            >
              <Coins className="w-4 h-4 text-amber-400" />
            </button>
            <span className={`text-xs ${coins < 0 ? 'text-rose-400' : 'text-zinc-600'}`}>{coins}</span>
          </div>
        )}
      </div>

      {coinsOpen && <CoinsPanel onClose={() => setCoinsOpen(false)} onChange={loadStats} />}

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all shadow-md"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </aside>
  );
}
