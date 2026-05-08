import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, deadline, status, parent_goal_id } = body;

    const updates: Record<string, unknown> = {};
    if (title !== undefined)          updates.title = title.trim();
    if (deadline !== undefined)        updates.deadline = deadline;
    if (status !== undefined)          updates.status = status;
    if (parent_goal_id !== undefined)  updates.parent_goal_id = parent_goal_id;

    const { data: goal, error } = await supabase
      .from('goals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ goal });
  } catch (err) {
    console.error('[PATCH /api/goals/[id]]', err);
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/goals/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
  }
}
