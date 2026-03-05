import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'
import EntriesList from '@/components/entries/EntriesList'

// Server Component for fetching entries
export const revalidate = 0 // Disable caching for real-time feel

export default async function EntriesPage() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: entries } = await supabase
        .from('entries')
        .select('*')
        .order('created_at', { ascending: false })

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center">
            <div className="w-full max-w-2xl">
                <header className="flex items-center justify-between mb-12">
                    <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </Link>
                    <h1 className="text-xl font-bold">Your Timeline</h1>
                    <Link
                        href="/entries/new"
                        className="bg-zinc-800 p-2 rounded-full hover:bg-zinc-700 transition-colors"
                    >
                        <Plus className="w-6 h-6" />
                    </Link>
                </header>

                <EntriesList initialEntries={entries || []} />
            </div>
        </div>
    )
}
