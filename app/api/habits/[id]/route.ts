import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { error } = await supabase
      .from('habits')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/habits/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete habit' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, color, frequency } = body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined)      updates.name = name;
    if (color !== undefined)     updates.color = color;
    if (frequency !== undefined) updates.frequency = frequency;

    const { data: habit, error } = await supabase
      .from('habits')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ habit });
  } catch (err) {
    console.error('[PATCH /api/habits/[id]]', err);
    return NextResponse.json({ error: 'Failed to update habit' }, { status: 500 });
  }
}
