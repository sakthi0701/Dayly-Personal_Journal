import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/not-to-do — list all items ordered by sort_order
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('not_to_do_items')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    console.error('[GET /api/not-to-do]', err);
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
  }
}

// POST /api/not-to-do — create a new item
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { label, emoji = '🚫' } = body;
    if (!label?.trim()) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }

    // Get max sort_order to append at end
    const { data: existing } = await supabase
      .from('not_to_do_items')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();
    const nextOrder = (existing?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from('not_to_do_items')
      .insert({ label: label.trim(), emoji, sort_order: nextOrder })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/not-to-do]', err);
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
  }
}
