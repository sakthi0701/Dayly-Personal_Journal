"use client";

import { useState, useEffect } from 'react';
import { Lock, Unlock, KeyRound } from 'lucide-react';
import { hashString } from '@/lib/security';

export default function AppLockSettings() {
    const [isLockEnabled, setIsLockEnabled] = useState(false);
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    // Setup state
    const [pin, setPin] = useState('');
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [error, setError] = useState('');

    // Remove state
    const [removePin, setRemovePin] = useState('');

    useEffect(() => {
        const hasPin = !!localStorage.getItem('dayly_pin_hash');
        setIsLockEnabled(hasPin);
    }, []);

    const handleSetupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pin.length !== 4) {
            setError('PIN must be exactly 4 digits.');
            return;
        }
        if (!question.trim() || !answer.trim()) {
            setError('Security question and answer are required.');
            return;
        }

        const pinHash = await hashString(pin);
        const answerHash = await hashString(answer.trim().toLowerCase());

        localStorage.setItem('dayly_pin_hash', pinHash);
        localStorage.setItem('dayly_security_question', question.trim());
        localStorage.setItem('dayly_security_answer_hash', answerHash);

        setIsLockEnabled(true);
        setIsSettingUp(false);
        setPin('');
        setQuestion('');
        setAnswer('');
        setError('');
    };

    const handleRemoveSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const storedHash = localStorage.getItem('dayly_pin_hash');
        if (!storedHash) {
            // Already removed or corrupted
            completeRemoval();
            return;
        }

        const pinHash = await hashString(removePin);
        if (pinHash === storedHash) {
            completeRemoval();
        } else {
            setError('Incorrect PIN. Cannot disable App Lock.');
            setRemovePin('');
        }
    };

    const completeRemoval = () => {
        localStorage.removeItem('dayly_pin_hash');
        localStorage.removeItem('dayly_security_question');
        localStorage.removeItem('dayly_security_answer_hash');
        localStorage.removeItem('dayly_is_locked');
        setIsLockEnabled(false);
        setIsRemoving(false);
        setRemovePin('');
        setError('');
    };

    return (
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 lg:p-8 mt-8">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#f49d25]/10 rounded-lg">
                        <Lock className="w-6 h-6 text-[#f49d25]" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">App Lock</h2>
                        <p className="text-sm text-zinc-400">Secure your journal with a 4-digit PIN</p>
                    </div>
                </div>

                {!isSettingUp && !isRemoving && (
                    <button
                        onClick={() => isLockEnabled ? setIsRemoving(true) : setIsSettingUp(true)}
                        className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${isLockEnabled
                                ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                : 'bg-[#f49d25]/10 text-[#f49d25] border border-[#f49d25]/20 hover:bg-[#f49d25]/20'
                            }`}
                    >
                        {isLockEnabled ? (
                            <><Unlock className="w-4 h-4" /> Disable</>
                        ) : (
                            <><KeyRound className="w-4 h-4" /> Enable</>
                        )}
                    </button>
                )}
            </div>

            {isSettingUp && (
                <form onSubmit={handleSetupSubmit} className="space-y-4 max-w-md animate-in fade-in slide-in-from-top-4">
                    <h3 className="text-lg font-medium mb-4">Set up PIN</h3>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-400">4-Digit PIN</label>
                        <input
                            type="password"
                            inputMode="numeric"
                            pattern="\d*"
                            maxLength={4}
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                            placeholder="0000"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#f49d25] focus:border-transparent transition-all"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-400">Security Question (Fallback)</label>
                        <input
                            type="text"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="e.g. What is my favorite movie?"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#f49d25] transition-all"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-400">Answer</label>
                        <input
                            type="text"
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            placeholder="Your answer"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#f49d25] transition-all"
                        />
                        <p className="text-xs text-zinc-500 mt-1">Make sure you remember this! It's the only way to recover your journal if you forget the PIN.</p>
                    </div>

                    {error && <p className="text-red-400 text-sm animate-pulse">{error}</p>}

                    <div className="flex gap-3 pt-4">
                        <button
                            type="submit"
                            disabled={pin.length !== 4 || !question || !answer}
                            className="px-6 py-2 bg-[#f49d25] text-white rounded-lg hover:bg-[#eb9015] transition font-medium disabled:opacity-50"
                        >
                            Save & Lock
                        </button>
                        <button
                            type="button"
                            onClick={() => { setIsSettingUp(false); setError(''); }}
                            className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {isRemoving && (
                <form onSubmit={handleRemoveSubmit} className="space-y-4 max-w-sm animate-in fade-in slide-in-from-top-4">
                    <h3 className="text-lg font-medium mb-4 text-red-400">Disable App Lock</h3>
                    <p className="text-sm text-zinc-400 mb-4">Enter your current PIN to remove the lock.</p>

                    <div className="space-y-1">
                        <input
                            type="password"
                            inputMode="numeric"
                            pattern="\d*"
                            maxLength={4}
                            autoFocus
                            value={removePin}
                            onChange={(e) => setRemovePin(e.target.value.replace(/\D/g, ''))}
                            placeholder="Wait, what was it?"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-center text-xl tracking-widest text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all font-mono"
                        />
                    </div>

                    {error && <p className="text-red-400 text-sm animate-pulse">{error}</p>}

                    <div className="flex gap-3 pt-4">
                        <button
                            type="submit"
                            disabled={removePin.length !== 4}
                            className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition font-medium disabled:opacity-50"
                        >
                            Remove Lock
                        </button>
                        <button
                            type="button"
                            onClick={() => { setIsRemoving(false); setError(''); }}
                            className="w-full py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </section>
    );
}
