'use client'

import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function DeleteEntryButton({ entryId }: { entryId: string }) {
    const [isDeleting, setIsDeleting] = useState(false)
    const router = useRouter()

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to delete this memory?')) return

        setIsDeleting(true)
        try {
            const { error } = await supabase
                .from('entries')
                .delete()
                .eq('id', entryId)

            if (error) throw error
            router.refresh()
        } catch (error) {
            console.error('Error deleting entry:', error)
            alert('Failed to delete entry.')
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-all disabled:opacity-50"
            title="Delete Entry"
        >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
    )
}
