'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import EntryEditor from '@/components/entries/EntryEditor';

export default function EditEntryPage() {
    const params = useParams();
    const router = useRouter();
    const entryId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [entryData, setEntryData] = useState<{
        content: string;
        mood: string | null;
        image_url: string | null;
    } | null>(null);

    useEffect(() => {
        async function fetchEntry() {
            try {
                const res = await fetch(`/api/entries/${entryId}`);
                if (!res.ok) throw new Error('Failed to fetch entry');
                const data = await res.json();
                if (data.entry) {
                    setEntryData(data.entry);
                }
            } catch (error) {
                console.error(error);
                alert('Could not load entry. It may have been deleted.');
                router.push('/entries');
            } finally {
                setLoading(false);
            }
        }
        if (entryId) {
            fetchEntry();
        }
    }, [entryId, router]);

    const handleUpdate = async (content: string, mood: string | null, imageUrl: string | null) => {
        const res = await fetch(`/api/entries/${entryId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, mood, image_url: imageUrl }),
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Failed to update entry');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
            </div>
        );
    }

    if (!entryData) return null;

    return (
        <EntryEditor
            entryId={entryId}
            initialContent={entryData.content}
            initialMood={entryData.mood}
            initialImageUrl={entryData.image_url}
            onSaveAction={handleUpdate}
        />
    );
}
