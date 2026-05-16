import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// PATCH /api/not-to-do/[id] — update label or emoji
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { label, emoji } = body;

    const updates: Record<string, string> = {};
    if (label !== undefined) updates.label = label.trim();
    if (emoji !== undefined) updates.emoji = emoji;

    const { data, error } = await supabase
      .from('not_to_do_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ item: data });
  } catch (err) {
    console.error('[PATCH /api/not-to-do/[id]]', err);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

// DELETE /api/not-to-do/[id]
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await supabase
      .from('not_to_do_items')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/not-to-do/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
