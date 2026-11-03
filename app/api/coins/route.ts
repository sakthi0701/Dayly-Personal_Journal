import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserStats, COIN_RULES } from '@/lib/gamification';
import { getISTDateString } from '@/lib/telegram-agent/executor';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = await getUserStats();
    if (!stats) return NextResponse.json({ error: 'Stats not found' }, { status: 404 });

    const [itemsRes, activityRes] = await Promise.all([
      supabase.from('shop_items').select('id, name, price').eq('archived', false).order('price', { ascending: true }),
      supabase.from('coin_transactions').select('id, amount, reason, source, meta, created_at')
        .order('created_at', { ascending: false }).limit(40),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (activityRes.error) throw activityRes.error;

    // Mirrors buy_shield(): price doubles per purchase this month, resets on the 1st
    const boughtThisMonth = stats.shield_month === getISTDateString().slice(0, 7) ? stats.shield_bought : 0;

    return NextResponse.json({
      coins: stats.coins,
      xp: stats.xp,
      shields: stats.shields,
      shieldsBoughtThisMonth: boughtThisMonth,
      shieldPrice: COIN_RULES.shieldBasePrice * 2 ** boughtThisMonth,
      rules: COIN_RULES,
      items: itemsRes.data ?? [],
      activity: activityRes.data ?? [],
    });
  } catch (err) {
    console.error('[GET /api/coins]', err);
    return NextResponse.json({ error: 'Failed to load coins' }, { status: 500 });
  }
}
