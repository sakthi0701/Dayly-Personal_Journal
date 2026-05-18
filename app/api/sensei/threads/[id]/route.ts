import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/sensei/threads/[id] — get thread with messages
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;

    const [threadRes, messagesRes] = await Promise.all([
      supabase.from('sensei_threads').select('*').eq('id', id).single(),
      supabase
        .from('sensei_messages')
        .select('id, role, content, created_at, metadata')
        .eq('thread_id', id)
        .order('created_at', { ascending: true }),
    ]);

    if (threadRes.error) throw threadRes.error;

    return NextResponse.json({
      thread: threadRes.data,
      messages: messagesRes.data ?? [],
    });
  } catch (err) {
    console.error('[GET /api/sensei/threads/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch thread' }, { status: 500 });
  }
}

// DELETE /api/sensei/threads/[id]
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;

    const { error } = await supabase.from('sensei_threads').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/sensei/threads/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete thread' }, { status: 500 });
  }
}
