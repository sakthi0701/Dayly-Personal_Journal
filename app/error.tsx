'use client';

/**
 * Route-level error boundary. A crash inside any page now shows this panel inside the normal
 * layout (sidebar stays usable) instead of white-screening the whole app. Added after an
 * unreproduced React #185 on /Jarvis — keep it even once that root cause is found.
 */
import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[Route error boundary]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center space-y-4">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
        <h2 className="text-lg font-semibold text-white">This page hit an error</h2>
        <p className="text-sm text-zinc-400">
          Your data is safe. Try again, or use the sidebar to go elsewhere.
        </p>
        <pre className="text-left text-[11px] text-zinc-500 bg-zinc-950 border border-zinc-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
          {error.message}{error.digest ? `\ndigest: ${error.digest}` : ''}
        </pre>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-sm rounded-xl transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Try again
        </button>
      </div>
    </div>
  );
}
