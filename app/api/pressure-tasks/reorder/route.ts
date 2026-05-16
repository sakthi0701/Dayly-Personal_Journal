import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST /api/pressure-tasks/reorder
// Expects: { updates: { id: string; sort_order: number }[] }
export async function POST(request: Request) {
  try {
    const { updates } = await request.json();

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'Invalid updates array' }, { status: 400 });
    }

    // Since Supabase RPC for bulk update might not be set up, 
    // we do sequential updates (fine for small lists)
    const promises = updates.map((u: any) =>
      supabase
        .from('pressure_tasks')
        .update({ sort_order: u.sort_order })
        .eq('id', u.id)
    );

    await Promise.all(promises);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('[POST /api/pressure-tasks/reorder]', err);
    return NextResponse.json({ error: 'Failed to reorder pressure tasks' }, { status: 500 });
  }
}
