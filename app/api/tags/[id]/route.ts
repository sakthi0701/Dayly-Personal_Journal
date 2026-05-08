import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Helper to get ID from params properly for App Router
async function getId(params: { id: string } | Promise<{ id: string }>) {
  if (params instanceof Promise) {
    return (await params).id;
  }
  return params.id;
}

export async function PATCH(request: Request, context: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const id = await getId(context.params);
    const body = await request.json();
    const { name } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    }

    const { data: tag, error } = await supabase
      .from('tags')
      .update({ name: name.trim().toLowerCase() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // unique violation
        return NextResponse.json({ error: 'Tag with this name already exists' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ tag });
  } catch (err) {
    console.error(`[PATCH /api/tags/[id]]`, err);
    return NextResponse.json({ error: 'Failed to update tag' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const id = await getId(context.params);

    // Delete relationships in task_tags first if ON DELETE CASCADE is missing or to be safe
    await supabase.from('task_tags').delete().eq('tag_id', id);

    // Now delete the tag itself
    const { error } = await supabase
      .from('tags')
      .delete()
      .eq('id', id);

    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[DELETE /api/tags/[id]]`, err);
    return NextResponse.json({ error: 'Failed to delete tag' }, { status: 500 });
  }
}
