import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST /api/not-to-do/reorder — batch update sort_order
// Body: { order: [{id: string, sort_order: number}] }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { order } = body as { order: { id: string; sort_order: number }[] };
    if (!Array.isArray(order)) {
      return NextResponse.json({ error: 'order array required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('not_to_do_items')
      .upsert(order.map(({ id, sort_order }) => ({ id, sort_order })));
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/not-to-do/reorder]', err);
    return NextResponse.json({ error: 'Failed to reorder items' }, { status: 500 });
  }
}
