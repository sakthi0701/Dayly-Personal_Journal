import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface ReorderItem {
  id: string;
  position: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { items }: { items: ReorderItem[] } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 });
    }

    // Single batch upsert — replaces N individual PATCH calls
    const { error } = await supabase
      .from('tasks')
      .upsert(
        items.map(({ id, position }) => ({ id, position })),
        { onConflict: 'id' }
      );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/tasks/reorder]', err);
    return NextResponse.json({ error: 'Failed to reorder tasks' }, { status: 500 });
  }
}
