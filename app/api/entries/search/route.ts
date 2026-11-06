import { NextResponse } from 'next/server';
import { searchJournal } from '@/lib/search/journal';

export const dynamic = 'force-dynamic';

/** GET /api/entries/search?q=… — hybrid (keyword + memory + semantic) journal search. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await searchJournal(q.slice(0, 200)) });
  } catch (err) {
    console.error('[GET /api/entries/search]', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
