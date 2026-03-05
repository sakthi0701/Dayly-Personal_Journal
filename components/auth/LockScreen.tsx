"use client";

import { useState, useEffect } from 'react';
import { hashString } from '@/lib/security';

interface LockScreenProps {
    onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isForgotMode, setIsForgotMode] = useState(false);
    const [securityAnswer, setSecurityAnswer] = useState('');
    const [question, setQuestion] = useState('');

    useEffect(() => {
        // Load the configured security question
        const q = localStorage.getItem('dayly_security_question');
        if (q) setQuestion(q);
    }, []);

    const handlePinSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const storedHash = localStorage.getItem('dayly_pin_hash');
        if (!storedHash) {
            // Failsafe: if no PIN is configured but we are here, just unlock.
            onUnlock();
            return;
        }

        const inputHash = await hashString(pin);
        if (inputHash === storedHash) {
            onUnlock();
        } else {
            setError('Incorrect PIN. Please try again.');
            setPin('');
        }
    };

    const handleSecuritySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const storedAnswerHash = localStorage.getItem('dayly_security_answer_hash');
        if (!storedAnswerHash) {
            setError('No security answer configured.');
            return;
        }

        // Hash the lowercased, trimmed standard input to minimize frustrating typos
        const normalizedInput = securityAnswer.trim().toLowerCase();
        const inputHash = await hashString(normalizedInput);

        if (inputHash === storedAnswerHash) {
            // Success! Reset everything.
            localStorage.removeItem('dayly_pin_hash');
            localStorage.removeItem('dayly_security_question');
            localStorage.removeItem('dayly_security_answer_hash');
            localStorage.removeItem('dayly_is_locked');
            alert("PIN reset successfully. Please configure a new one in settings.");
            onUnlock();
        } else {
            setError('Incorrect answer.');
            setSecurityAnswer('');
        }
    };

    if (isForgotMode) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 select-none z-[9999] fixed inset-0">
                <div className="w-full max-w-sm flex flex-col items-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="space-y-2 text-center">
                        <h1 className="text-3xl font-bold tracking-tight text-white">Reset PIN</h1>
                        <p className="text-zinc-400">Answer your security question</p>
                    </div>

                    <form onSubmit={handleSecuritySubmit} className="w-full space-y-6">
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-zinc-300 text-center">
                                {question || "What is your security question?"}
                            </label>
                            <input
                                type="text"
                                autoFocus
                                value={securityAnswer}
                                onChange={(e) => setSecurityAnswer(e.target.value)}
                                placeholder="Your Answer"
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-center text-white focus:outline-none focus:ring-2 focus:ring-[#f49d25] focus:border-transparent transition-all"
                            />
                            {error && <p className="text-red-400 text-sm text-center animate-pulse">{error}</p>}
                        </div>

                        <button
                            type="submit"
                            disabled={!securityAnswer}
                            className="w-full bg-[#f49d25] hover:bg-[#eb9015] text-white font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Verify Answer
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setIsForgotMode(false);
                                setError('');
                                setSecurityAnswer('');
                            }}
                            className="w-full text-zinc-500 hover:text-zinc-300 text-sm transition-colors mt-2"
                        >
                            Back to PIN
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 select-none z-[9999] fixed inset-0">
            <div className="w-full max-w-sm flex flex-col items-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="space-y-2 text-center">
                    <div className="w-16 h-16 bg-[#f49d25]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#f49d25]">
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-8">Journal Locked</h1>
                </div>

                <form onSubmit={handlePinSubmit} className="w-full space-y-6 flex flex-col items-center">
                    <div className="space-y-4 w-full flex flex-col items-center">
                        <input
                            type="password"
                            inputMode="numeric"
                            pattern="\d*"
                            maxLength={4}
                            autoFocus
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} // Ensure numeric only
                            placeholder="Enter 4-digit PIN"
                            className="w-64 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4 text-center text-xl tracking-[1em] text-white font-mono placeholder:tracking-normal placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#f49d25] focus:border-transparent transition-all"
                        />
                        {error && <p className="text-red-400 text-sm text-center animate-pulse">{error}</p>}
                    </div>

                    <button
                        type="submit"
                        disabled={pin.length !== 4}
                        className="w-64 bg-white/5 hover:bg-white/10 text-white font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        Unlock
                    </button>

                    {question && ( // Only show if a question is actually configured
                        <button
                            type="button"
                            onClick={() => {
                                setIsForgotMode(true);
                                setError('');
                                setPin('');
                            }}
                            className="text-[#f49d25] hover:text-[#eb9015] hover:underline text-sm font-medium transition-all"
                        >
                            Forgot PIN?
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
}
