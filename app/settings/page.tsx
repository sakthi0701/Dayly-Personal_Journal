'use client';

import { useState } from 'react';
import { ArrowLeft, ShieldCheck, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLockSettings from '@/components/settings/AppLockSettings';

export default function SettingsPage() {
    const [isConfirming, setIsConfirming] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();

    const handleClearData = async () => {
        setIsDeleting(true);
        try {
            const res = await fetch('/api/settings/clear-data', {
                method: 'DELETE',
            });
            if (res.ok) {
                // Refresh and go home on success
                router.refresh();
                router.push('/');
            } else {
                console.error("Failed to clear data");
            }
        } catch (error) {
            console.error("Error clearing data:", error);
        } finally {
            setIsDeleting(false);
            setIsConfirming(false);
        }
    };

    return (
        <main className="min-h-screen p-8 lg:p-24 max-w-4xl mx-auto">
            <div className="flex flex-col gap-8">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Link href="/dashboard" className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition">
                        <ArrowLeft className="w-5 h-5 text-zinc-400" />
                    </Link>
                    <h1 className="text-3xl font-bold">Settings</h1>
                </div>

                {/* Privacy & Data Transparency Section */}
                <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 lg:p-8">
                    <div className="flex items-center gap-3 border-b border-zinc-800 pb-4 mb-6">
                        <div className="p-2 bg-green-500/10 rounded-lg">
                            <ShieldCheck className="w-6 h-6 text-green-500" />
                        </div>
                        <h2 className="text-xl font-bold">Data &amp; Privacy Guarantee</h2>
                    </div>

                    <div className="space-y-4 text-sm text-zinc-400 leading-relaxed max-w-2xl">
                        <p>
                            <strong>Your mind is your own.</strong> Dayly acts as your Active Memory Journal, employing advanced AI to organize and reflect your thoughts back to you. We believe privacy is the absolute foundation of this relationship.
                        </p>
                        <p>
                            All journal entries are processed securely using our backend services (OpenAI, Groq) to generate insights and embeddings. Your raw data is stored in your personal Supabase instance.
                        </p>
                        <p>
                            <strong>We do not sell, share, or analyze your data for advertising.</strong> You maintain complete ownership of everything you write or speak into this application.
                        </p>
                    </div>

                    <AppLockSettings />

                    {/* Danger Zone */}
                    <div className="mt-12 pt-6 border-t border-red-500/20">
                        <h3 className="text-lg font-bold text-red-500 mb-2">Danger Zone</h3>
                        <p className="text-sm text-zinc-500 mb-6 max-w-xl">
                            Permanently delete all of your journal entries, wipe your Active Memory timeline, and reset your streak and gamification stats back to day zero. This action cannot be undone.
                        </p>

                        {!isConfirming ? (
                            <button
                                onClick={() => setIsConfirming(true)}
                                className="px-6 py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition font-medium flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" /> Clear My Data
                            </button>
                        ) : (
                            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg inline-block">
                                <div className="flex gap-2 items-center text-red-400 font-medium mb-4">
                                    <AlertTriangle className="w-5 h-5" />
                                    Are you absolutely sure?
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setIsConfirming(false)}
                                        disabled={isDeleting}
                                        className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition text-sm disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleClearData}
                                        disabled={isDeleting}
                                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 transition text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, Delete Everything"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}
