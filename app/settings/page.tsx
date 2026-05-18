'use client';

import { useState } from 'react';
import { ArrowLeft, ShieldCheck, Trash2, AlertTriangle, Loader2, Lock, Eye, EyeOff, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLockSettings from '@/components/settings/AppLockSettings';
import TimezoneSettings from '@/components/settings/TimezoneSettings';
import { hashString } from '@/lib/security';

// ── PIN Verification Modal ─────────────────────────────────────────────────────
function PinVerifyModal({ onVerified, onCancel }: { onVerified: () => void; onCancel: () => void }) {
    const [pin, setPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pin) return;
        setLoading(true);
        setError('');

        try {
            let targetHash = localStorage.getItem('dayly_pin_hash');
            // Fall back to master PIN if no custom PIN is configured
            if (!targetHash) {
                targetHash = await hashString(process.env.NEXT_PUBLIC_MASTER_PIN || '2027');
            }

            const inputHash = await hashString(pin);
            if (inputHash === targetHash) {
                onVerified();
            } else {
                setError('Incorrect PIN. Operation blocked.');
                setPin('');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-8 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                {/* Close */}
                <button
                    onClick={onCancel}
                    className="absolute top-4 right-4 p-1.5 text-zinc-600 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Icon */}
                <div className="flex items-center justify-center mb-5">
                    <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <Lock className="w-6 h-6 text-red-400" />
                    </div>
                </div>

                <h3 className="text-lg font-bold text-white text-center mb-1">PIN Required</h3>
                <p className="text-xs text-zinc-500 text-center mb-6">
                    Enter your PIN to authorize this irreversible action.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative">
                        <input
                            type={showPin ? 'text' : 'password'}
                            inputMode="numeric"
                            pattern="\d*"
                            maxLength={4}
                            autoFocus
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                            placeholder="4-digit PIN"
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-center text-xl tracking-[1em] text-white font-mono placeholder:tracking-normal placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/40 transition-all pr-12"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPin(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition"
                        >
                            {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    {error && (
                        <p className="text-red-400 text-sm text-center animate-pulse">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={pin.length !== 4 || loading}
                        className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                        Authorize Delete
                    </button>
                </form>
            </div>
        </div>
    );
}

// ── Settings Page ──────────────────────────────────────────────────────────────
export default function SettingsPage() {
    const [isConfirming, setIsConfirming] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();

    // Step 1: "Clear My Data" clicked → show first confirmation
    // Step 2: "Yes, Delete Everything" clicked → show PIN modal
    // Step 3: PIN verified → actually delete
    const handleClearData = async () => {
        setShowPinModal(false);
        setIsDeleting(true);
        try {
            const res = await fetch('/api/settings/clear-data', {
                method: 'DELETE',
            });
            if (res.ok) {
                router.refresh();
                router.push('/');
            } else {
                console.error('Failed to clear data');
            }
        } catch (error) {
            console.error('Error clearing data:', error);
        } finally {
            setIsDeleting(false);
            setIsConfirming(false);
        }
    };

    return (
        <main className="min-h-screen p-8 lg:p-24 max-w-4xl mx-auto">
            {/* PIN verification modal */}
            {showPinModal && (
                <PinVerifyModal
                    onVerified={handleClearData}
                    onCancel={() => setShowPinModal(false)}
                />
            )}

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
                            All journal entries are processed securely using our backend services (Groq, Google Gemini) to generate insights and embeddings. Your raw data is stored in your personal Supabase instance.
                        </p>
                        <p>
                            <strong>We do not sell, share, or analyze your data for advertising.</strong> You maintain complete ownership of everything you write or speak into this application.
                        </p>
                    </div>

                    <AppLockSettings />
                    <TimezoneSettings />

                    {/* Danger Zone */}
                    <div className="mt-12 pt-6 border-t border-red-500/20">
                        <h3 className="text-lg font-bold text-red-500 mb-2">Danger Zone</h3>
                        <p className="text-sm text-zinc-500 mb-6 max-w-xl">
                            Permanently delete all of your journal entries, wipe your Active Memory timeline, and reset your streak and gamification stats back to day zero. This action cannot be undone and requires your PIN.
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
                                    Are you absolutely sure? This cannot be undone.
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
                                        onClick={() => setShowPinModal(true)}
                                        disabled={isDeleting}
                                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 transition text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {isDeleting
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : <><Lock className="w-3.5 h-3.5" /> Yes, Delete Everything</>
                                        }
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
