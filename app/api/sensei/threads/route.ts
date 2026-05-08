import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/sensei/threads — list all threads newest first
export async function GET() {
  try {
    const { data: threads, error } = await supabase
      .from('sensei_threads')
      .select('id, title, created_at, updated_at, last_message_at')
      .order('last_message_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ threads: threads ?? [] });
  } catch (err) {
    console.error('[GET /api/sensei/threads]', err);
    return NextResponse.json({ error: 'Failed to fetch threads' }, { status: 500 });
  }
}

// POST /api/sensei/threads — create a new thread
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title } = body;

    const { data: thread, error } = await supabase
      .from('sensei_threads')
      .insert({ title: title ?? null })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ thread }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/sensei/threads]', err);
    return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 });
  }
}
