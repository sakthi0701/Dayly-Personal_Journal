import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Archive rather than delete: past purchases in the ledger keep referring to it
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await supabase.from('shop_items').update({ archived: true }).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/coins/items/[id]]', err);
    return NextResponse.json({ error: 'Failed to remove reward' }, { status: 500 });
  }
}
