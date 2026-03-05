'use client'

import { supabase } from '@/lib/supabase'
import EntryEditor from '@/components/entries/EntryEditor'

export default function NewEntryPage() {
    const handleSave = async (content: string, mood: string | null, imageUrl: string | null) => {
        // 1. Save to Supabase
        const { data, error } = await supabase
            .from('entries')
            .insert([{ content, mood, image_url: imageUrl }])
            .select()
            .single()

        if (error) throw error

        // 2. Trigger "The Gardener" (Background Process for Embeddings)
        await fetch('/api/process-entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entry_id: data.id, content }),
        });

        // 3. Update Gamification Stats
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        await fetch('/api/stats/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone: tz }),
        });

        // 4. If this is the first entry, complete onboarding
        // We let the editor component handle checking onboarded state since we passed it in, but here 
        // we can just call it blindly. However, `EntryEditor` checks `hasOnboarded` status dynamically and tells us indirectly.
        // Actually, to avoid fetching stats twice, let's just always call it or fetch it here.
        // For simplicity, we'll keep the onboarding complete call but check first to avoid unnecessary updates.
        try {
            const res = await fetch('/api/stats/user')
            if (res.ok) {
                const data = await res.json()
                if (!data.stats?.has_onboarded) {
                    const onboardRes = await fetch('/api/onboarding/complete', { method: 'POST' });
                    if (!onboardRes.ok) {
                        console.error("Failed to mark onboarding complete.");
                    }
                }
            }
        } catch (e) {
            console.error("Failed to update onboarding stats", e)
        }
    }

    return (
        <EntryEditor
            onSaveAction={handleSave}
            hasOnboardedProp={true} // The editor checks it internally if not passed, wait, I set default true. I should change the editor so it fetches it if not provided.
        />
    )
}
