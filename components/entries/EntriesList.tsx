'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Loader2 } from 'lucide-react';
import DeleteEntryButton from './DeleteEntryButton';

interface Entry {
    id: string;
    created_at: string;
    content: string;
    mood?: string;
    image_url?: string;
}

interface EntriesListProps {
    initialEntries: Entry[];
}

export default function EntriesList({ initialEntries }: EntriesListProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    const filteredEntries = useMemo(() => {
        if (!searchQuery.trim()) return initialEntries;

        const lowerQuery = searchQuery.toLowerCase();
        return initialEntries.filter(entry =>
            entry.content.toLowerCase().includes(lowerQuery)
        );
    }, [initialEntries, searchQuery]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setIsSearching(true);
        setSearchQuery(e.target.value);
        // Fake a small delay for UI responsiveness feel
        setTimeout(() => setIsSearching(false), 300);
    };

    return (
        <div className="space-y-8">
            {/* Search Bar */}
            <div className="relative mb-8">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-zinc-500" />
                </div>
                <input
                    type="text"
                    placeholder="Search past entries..."
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
                        {searchQuery ? (
                            <p>No memories match '{searchQuery}'.</p>
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
