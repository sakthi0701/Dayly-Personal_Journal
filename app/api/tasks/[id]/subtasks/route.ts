import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const { data: subtasks, error } = await supabase
      .from('tasks')
      .select(`
        *,
        task_tags (
          tags ( id, name )
        )
      `)
      .eq('parent_task_id', id)
      .order('position', { ascending: true });

    if (error) throw error;

    const normalized = (subtasks || []).map((task) => ({
      ...task,
      tags: task.task_tags?.map((tt: { tags: { id: string; name: string } | null }) => tt.tags).filter(Boolean) ?? [],
      task_tags: undefined,
    }));

    return NextResponse.json({ subtasks: normalized });
  } catch (err) {
    console.error('[GET /api/tasks/[id]/subtasks]', err);
    return NextResponse.json({ error: 'Failed to fetch subtasks' }, { status: 500 });
  }
}
