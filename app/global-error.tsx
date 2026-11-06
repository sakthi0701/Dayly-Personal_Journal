'use client';

/**
 * Last-resort boundary for crashes in the root layout itself (Sidebar, call manager, check-in
 * dialog, timer UI), which app/error.tsx cannot catch. Replaces the white screen with a reload.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', background: '#09090b', color: '#e4e4e7', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Dayly hit an error</h2>
          <p style={{ fontSize: 14, color: '#a1a1aa', marginBottom: 12 }}>Your data is safe.</p>
          <pre style={{ fontSize: 11, color: '#71717a', textAlign: 'left', whiteSpace: 'pre-wrap', background: '#18181b', padding: 12, borderRadius: 8 }}>
            {error.message}{error.digest ? `\ndigest: ${error.digest}` : ''}
          </pre>
          <button onClick={() => { reset(); location.reload(); }} style={{ marginTop: 12, padding: '8px 16px', background: '#27272a', color: '#e4e4e7', border: '1px solid #3f3f46', borderRadius: 12, cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
