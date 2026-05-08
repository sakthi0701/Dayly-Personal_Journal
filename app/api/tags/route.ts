import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { data: tags, error } = await supabase
      .from('tags')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ tags: tags ?? [] });
  } catch (err) {
    console.error('[GET /api/tags]', err);
    return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    }

    // Upsert so duplicate names don't 500
    const { data: tag, error } = await supabase
      .from('tags')
      .upsert({ name: name.trim().toLowerCase() }, { onConflict: 'name' })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ tag }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tags]', err);
    return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 });
  }
}
