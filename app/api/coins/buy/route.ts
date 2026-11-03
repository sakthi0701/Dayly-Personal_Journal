import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { applyCoinTx, COIN_RULES } from '@/lib/gamification';
import { getISTDateString } from '@/lib/telegram-agent/executor';

/** Body: { itemId } to buy a reward, or { shield: true } to buy a Habit Shield */
export async function POST(request: Request) {
  try {
    const { itemId, shield } = await request.json();

    if (shield) {
      const { data, error } = await supabase.rpc('buy_shield', {
        p_base_price: COIN_RULES.shieldBasePrice,
        p_month: getISTDateString().slice(0, 7),
      });
      if (error) throw error;
      if (!data?.ok) return NextResponse.json({ error: 'Not enough coins', ...data }, { status: 402 });
      return NextResponse.json(data);
    }

    const { data: item, error: itemErr } = await supabase
      .from('shop_items').select('id, name, price').eq('id', itemId).eq('archived', false).single();
    if (itemErr || !item) return NextResponse.json({ error: 'Reward not found' }, { status: 404 });

    // requireFunds also blocks every purchase while the balance is negative (debt)
    const res = await applyCoinTx({
      amount: -item.price,
      source: 'shop',
      reason: `Bought ${item.name}`,
      meta: { itemId: item.id },
      requireFunds: true,
    });
    if (!res.ok) return NextResponse.json({ error: 'Not enough coins', ...res }, { status: 402 });

    return NextResponse.json(res);
  } catch (err) {
    console.error('[POST /api/coins/buy]', err);
    return NextResponse.json({ error: 'Purchase failed' }, { status: 500 });
  }
}
