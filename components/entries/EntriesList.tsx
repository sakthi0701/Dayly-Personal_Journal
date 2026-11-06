'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Loader2 } from 'lucide-react';
import DeleteEntryButton from './DeleteEntryButton';
import type { MatchReason } from '@/lib/search/journal';

interface Entry {
    id: string;
    created_at: string;
    content: string;
    mood?: string | null;
    image_url?: string | null;
    reasons?: MatchReason[];
}

interface EntriesListProps {
    initialEntries: Entry[];
}

const SEARCH_DEBOUNCE_MS = 400;

function ReasonChips({ reasons }: { reasons: MatchReason[] }) {
    return (
        <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
            {reasons.map((r, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 max-w-full truncate">
                    {r.kind === 'keyword' ? `Mentions: ${r.terms.join(', ')}`
                        : r.kind === 'memory' ? `Remembered: ${r.fact}`
                        : 'Similar in meaning'}
                </span>
            ))}
        </div>
    );
}

export default function EntriesList({ initialEntries }: EntriesListProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<Entry[] | null>(null); // null = show full timeline
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState(false);

    // Hybrid search (keyword + memory + meaning) runs server-side; see lib/search/journal.ts
    useEffect(() => {
        const q = searchQuery.trim();
        if (q.length < 2) return;
        const controller = new AbortController();
        const id = setTimeout(async () => {
            setIsSearching(true);
            setSearchError(false);
            try {
                const res = await fetch(`/api/entries/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
                if (!res.ok) throw new Error(String(res.status));
                setResults((await res.json()).results ?? []);
            } catch (e) {
                if ((e as Error).name !== 'AbortError') setSearchError(true);
            } finally {
                if (!controller.signal.aborted) setIsSearching(false);
            }
        }, SEARCH_DEBOUNCE_MS);
        return () => { clearTimeout(id); controller.abort(); };
    }, [searchQuery]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchQuery(value);
        if (value.trim().length < 2) { setResults(null); setIsSearching(false); setSearchError(false); }
    };

    const filteredEntries = results ?? initialEntries;

    return (
        <div className="space-y-8">
            {/* Search Bar */}
            <div className="relative mb-8">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-zinc-500" />
                </div>
                <input
                    type="text"
                    placeholder="Search by word or meaning, e.g. times I felt like procrastinating"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="block w-full pl-10 pr-12 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl leading-5 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:bg-zinc-900 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 sm:text-sm transition-all"
                />
                {isSearching && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
                    </div>
                )}
            </div>

            {results && !isSearching && results.length > 0 && (
                <p className="text-xs text-zinc-400 -mt-4">Best matches for &ldquo;{searchQuery.trim()}&rdquo;, most relevant first</p>
            )}
            {searchError && <p className="text-xs text-rose-400 -mt-4">Search failed. Try again in a moment.</p>}

            {/* Entries Timeline */}
            <div className="space-y-8">
                {filteredEntries.map((entry) => (
                    <div key={entry.id} className="relative pl-8 border-l border-zinc-800 group">
                        <span className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-zinc-800 border-2 border-zinc-950" />

                        {/* Actions */}
                        <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                            <Link
                                href={`/entries/${entry.id}/edit`}
                                className="text-zinc-500 hover:text-indigo-400 p-2 hover:bg-zinc-800/50 rounded-full transition-colors"
                                title="Edit entry"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                            </Link>
                            <DeleteEntryButton entryId={entry.id} />
                        </div>
                        <div className="mb-2 pr-8 text-xs text-zinc-500 font-mono flex items-center gap-2">
                            <span>
                                {new Date(entry.created_at).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric',
                                })}
                                &nbsp;&bull;&nbsp;
                                {new Date(entry.created_at).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </span>
                            {entry.mood && (
                                <span className="text-base bg-zinc-900 px-1.5 py-0.5 rounded-md border border-zinc-800" title="Mood">
                                    {entry.mood}
                                </span>
                            )}
                        </div>
                        {entry.reasons && entry.reasons.length > 0 && <ReasonChips reasons={entry.reasons} />}
                        {entry.image_url && (
                            <div className="my-4">
                                <img
                                    src={entry.image_url}
                                    alt="Entry attachment"
                                    className="max-h-64 object-contain rounded-lg border border-zinc-800 bg-zinc-900/50"
                                />
                            </div>
                        )}
                        <div
                            className="prose prose-invert prose-p:text-lg prose-p:leading-relaxed prose-p:text-zinc-300 font-serif max-w-none [&_[data-type=ai-question]]:bg-indigo-950/30 [&_[data-type=ai-question]]:border-l-4 [&_[data-type=ai-question]]:border-indigo-500 [&_[data-type=ai-question]]:p-4 [&_[data-type=ai-question]]:my-4 [&_[data-type=ai-question]]:rounded-r-lg [&_[data-type=ai-question]]:text-indigo-200 [&_[data-type=ai-question]]:italic"
                            dangerouslySetInnerHTML={{ __html: entry.content }}
                        />
                    </div>
                ))}

                {filteredEntries.length === 0 && (
                    <div className="text-center py-20 text-zinc-600">
                        {results ? (
                            <p>No memories match &lsquo;{searchQuery.trim()}&rsquo;.</p>
                        ) : (
                            <>
                                <p>No memories yet.</p>
                                <Link href="/entries/new" className="text-blue-500 hover:underline mt-2 inline-block">
                                    Start writing
                                </Link>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
