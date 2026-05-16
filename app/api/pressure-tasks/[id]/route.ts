import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { addXP } from '@/lib/gamification';

// PATCH /api/pressure-tasks/[id]
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, priority, deadline, estimated_minutes, status } = body;

    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title.trim();
    if (priority !== undefined) updates.priority = priority;
    if (deadline !== undefined) updates.deadline = deadline;
    if (estimated_minutes !== undefined) updates.estimated_minutes = estimated_minutes;
    if (status !== undefined) {
      updates.status = status;
      if (status === 'done') {
        updates.completed_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from('pressure_tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    // Award XP on completion — on-time vs late
    if (status === 'done' && data.deadline) {
      const deadline_ts = new Date(data.deadline).getTime();
      const now = Date.now();
      const isOnTime = now <= deadline_ts;
      await addXP(isOnTime ? 20 : 8);
    }

    return NextResponse.json({ task: data });
  } catch (err) {
    console.error('[PATCH /api/pressure-tasks/[id]]', err);
    return NextResponse.json({ error: 'Failed to update pressure task' }, { status: 500 });
  }
}

// DELETE /api/pressure-tasks/[id]
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await supabase
      .from('pressure_tasks')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/pressure-tasks/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete pressure task' }, { status: 500 });
  }
}
