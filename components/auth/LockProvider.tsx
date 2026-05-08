"use client";

import { useState, useEffect } from 'react';
import LockScreen from './LockScreen';

export default function LockProvider({ children }: { children: React.ReactNode }) {
    const [isLocked, setIsLocked] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        const sessionUnlocked = sessionStorage.getItem('dayly_session_unlocked');
        if (!sessionUnlocked) {
            setIsLocked(true);
        }
    }, []);

    const handleUnlock = () => {
        sessionStorage.setItem('dayly_session_unlocked', 'true');
        setIsLocked(false);
    };

    // Prevent hydration mismatch and content flash by not rendering anything until client checks storage
    if (!isMounted) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 select-none z-[9999] fixed inset-0">
                <div className="w-8 h-8 rounded-full border-2 border-[#f49d25] border-t-transparent animate-spin"></div>
            </div>
        );
    }

    if (isLocked) {
        return <LockScreen onUnlock={handleUnlock} />;
    }

    return <>{children}</>;
}
