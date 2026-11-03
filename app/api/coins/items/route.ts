import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { name, price } = await request.json();
    const trimmed = typeof name === 'string' ? name.trim() : '';
    const amount = Number(price);

    if (!trimmed || !Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Name and a positive whole price are required' }, { status: 400 });
    }

    const { data: item, error } = await supabase
      .from('shop_items')
      .insert({ name: trimmed.slice(0, 60), price: amount })
      .select('id, name, price')
      .single();
    if (error) throw error;

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/coins/items]', err);
    return NextResponse.json({ error: 'Failed to add reward' }, { status: 500 });
  }
}
