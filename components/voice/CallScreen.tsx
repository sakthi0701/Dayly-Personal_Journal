'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Phone, PhoneOff, AlarmClock, Mic, MicOff, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { SenseiLiveCall, type CallStatus, type TranscriptLine } from '@/lib/voice/liveCall';
import SnoozeDial from './SnoozeDial';

/** Unanswered ring auto-stops after this long and counts as a missed call */
const RING_TIMEOUT_MS = 45_000;

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// ── HUD orb ────────────────────────────────────────────────────────────────────

interface Levels { mic: number; speaker: number }

/**
 * Concentric holographic rings. `getLevels` is polled every frame and written straight
 * to the DOM (no React re-render at 60fps).
 */
function HudOrb({ getLevels, ringing, size = 240 }: { getLevels?: () => Levels; ringing?: boolean; size?: number }) {
  const coreRef = useRef<SVGCircleElement>(null);
  const micRef = useRef<SVGCircleElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getLevels) return;
    let raf = 0;
    let s = 0, m = 0;
    const loop = () => {
      const l = getLevels();
      s += (l.speaker - s) * 0.25; // smooth
      m += (l.mic - m) * 0.25;
      if (coreRef.current) coreRef.current.style.transform = `scale(${1 + s * 0.45})`;
      if (micRef.current) {
        micRef.current.style.transform = `scale(${1 + m * 0.25})`;
        micRef.current.style.strokeOpacity = String(0.15 + m * 0.85);
      }
      if (glowRef.current) glowRef.current.style.opacity = String(0.35 + s * 0.65);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getLevels]);

  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden>
      <div
        ref={glowRef}
        className="absolute inset-0 rounded-full"
        style={{ background: 'radial-gradient(circle, rgb(34 211 238 / 0.35) 0%, transparent 65%)', opacity: 0.5 }}
      />
      {ringing && (
        <>
          <div className="sensei-motion absolute inset-[18%] rounded-full border border-cyan-300/50" style={{ animation: 'sensei-ping 2s ease-out infinite' }} />
          <div className="sensei-motion absolute inset-[18%] rounded-full border border-cyan-300/50" style={{ animation: 'sensei-ping 2s ease-out 1s infinite' }} />
        </>
      )}
      <svg viewBox="0 0 240 240" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="sensei-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ecfeff" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#67e8f9" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0891b2" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Outer dashed ring */}
        <g className="sensei-motion" style={{ transformOrigin: '120px 120px', animation: 'sensei-spin 28s linear infinite' }}>
          <circle cx="120" cy="120" r="112" fill="none" stroke="rgb(103 232 249 / 0.35)" strokeWidth="1.5" strokeDasharray="2 6" />
          <path d="M120 8 A112 112 0 0 1 199 41" fill="none" stroke="rgb(103 232 249 / 0.8)" strokeWidth="3" strokeLinecap="round" />
          <path d="M120 232 A112 112 0 0 1 41 199" fill="none" stroke="rgb(103 232 249 / 0.8)" strokeWidth="3" strokeLinecap="round" />
        </g>
        {/* Segmented ring, counter-rotating */}
        <g className="sensei-motion" style={{ transformOrigin: '120px 120px', animation: 'sensei-spin-rev 18s linear infinite' }}>
          <circle cx="120" cy="120" r="96" fill="none" stroke="rgb(34 211 238 / 0.5)" strokeWidth="5" strokeDasharray="40 22 8 22" />
        </g>
        {/* Static tick ring */}
        {ticks.map((i) => {
          const a = (i / 60) * 2 * Math.PI;
          const r1 = i % 5 === 0 ? 76 : 80;
          return (
            <line key={i} x1={120 + r1 * Math.sin(a)} y1={120 - r1 * Math.cos(a)} x2={120 + 84 * Math.sin(a)} y2={120 - 84 * Math.cos(a)}
              stroke="rgb(165 243 252)" strokeOpacity={i % 5 === 0 ? 0.55 : 0.2} strokeWidth="1" />
          );
        })}
        {/* Mic ring — brightens while you speak */}
        <circle ref={micRef} cx="120" cy="120" r="64" fill="none" stroke="#ffffff" strokeOpacity="0.15" strokeWidth="1.5"
          style={{ transformOrigin: '120px 120px', transition: 'stroke-opacity 80ms' }} />
        {/* Core — swells while Sensei speaks */}
        <circle ref={coreRef} cx="120" cy="120" r="44" fill="url(#sensei-core)" style={{ transformOrigin: '120px 120px' }} />
      </svg>
    </div>
  );
}

// ── Ringtone ───────────────────────────────────────────────────────────────────

/** Soft two-note chime + vibration, repeated until stopped. Silently no-ops if audio is blocked. */
function useRingtone(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let ctx: AudioContext | null = null;
    try { ctx = new AudioContext(); ctx.resume().catch(() => {}); } catch { ctx = null; }

    const chime = () => {
      navigator.vibrate?.([350, 150, 350]);
      if (!ctx || ctx.state === 'closed') return;
      const t0 = ctx.currentTime;
      [[659.25, 0], [987.77, 0.16], [659.25, 0.6], [987.77, 0.76]].forEach(([f, dt]) => {
        const osc = ctx!.createOscillator();
        const g = ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime(0.16, t0 + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.5);
        osc.connect(g).connect(ctx!.destination);
        osc.start(t0 + dt);
        osc.stop(t0 + dt + 0.55);
      });
    };
    chime();
    const id = setInterval(chime, 2600);
    return () => {
      clearInterval(id);
      navigator.vibrate?.(0);
      ctx?.close().catch(() => {});
    };
  }, [active]);
}

// ── Ringing ────────────────────────────────────────────────────────────────────

function RingView({ onAccept, onDecline, onSnooze, onMissed }: {
  onAccept: () => void; onDecline: () => void; onSnooze: (m: number) => void; onMissed: () => void;
}) {
  const [snoozing, setSnoozing] = useState(false);
  useRingtone(!snoozing);

  useEffect(() => {
    if (snoozing) return;
    const id = setTimeout(onMissed, RING_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [snoozing, onMissed]);

  if (snoozing) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <SnoozeDial onSnooze={onSnooze} onBack={() => setSnoozing(false)} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-between px-6 py-10">
      <div className="text-center" style={{ animation: 'sensei-fade-in 0.4s ease-out both' }}>
        <p className="flex items-center justify-center gap-2 text-[11px] tracking-[0.35em] text-cyan-300/80 uppercase">
          <span className="sensei-motion w-1.5 h-1.5 rounded-full bg-cyan-300" style={{ animation: 'sensei-caret 1s steps(1) infinite' }} />
          Incoming check-in
        </p>
        <h2 className="mt-4 text-4xl font-bold tracking-[0.2em] text-white">SENSEI</h2>
        <p className="mt-2 text-sm text-zinc-400">Wants to hear how your day is going</p>
      </div>

      <HudOrb ringing />

      <div className="w-full max-w-xs grid grid-cols-3 items-end gap-4">
        <RoundButton label="Decline" onClick={onDecline} className="bg-red-500/90 hover:bg-red-500 text-white">
          <PhoneOff className="w-6 h-6" />
        </RoundButton>
        <RoundButton label="Snooze" onClick={() => setSnoozing(true)} className="bg-white/10 hover:bg-white/15 text-cyan-100 border border-white/10" small>
          <AlarmClock className="w-5 h-5" />
        </RoundButton>
        <RoundButton label="Accept" onClick={onAccept} className="bg-cyan-400 hover:bg-cyan-300 text-zinc-950 shadow-[0_0_30px_rgb(34_211_238/0.5)]">
          <Phone className="w-6 h-6" />
        </RoundButton>
      </div>
    </div>
  );
}

function RoundButton({ label, onClick, className, small, children }: {
  label: string; onClick: () => void; className: string; small?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        aria-label={label}
        className={`${small ? 'w-14 h-14' : 'w-[68px] h-[68px]'} rounded-full flex items-center justify-center transition-all active:scale-95 ${className}`}
      >
        {children}
      </button>
      <span className="text-[11px] text-zinc-400">{label}</span>
    </div>
  );
}

// ── In call ────────────────────────────────────────────────────────────────────

function SubtitleLine({ line }: { line: TranscriptLine }) {
  if (line.role === 'action') {
    const Icon = !line.final ? Loader2 : line.ok ? CheckCircle2 : AlertCircle;
    return (
      <div className="flex justify-center" style={{ animation: 'sensei-fade-in 0.2s ease-out both' }}>
        <span className={`inline-flex items-center gap-1.5 max-w-[90%] px-3 py-1.5 rounded-full text-xs border ${
          !line.final ? 'border-cyan-300/30 text-cyan-200 bg-cyan-400/10'
            : line.ok ? 'border-emerald-400/30 text-emerald-200 bg-emerald-400/10'
            : 'border-amber-400/30 text-amber-200 bg-amber-400/10'
        }`}>
          <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${!line.final ? 'animate-spin' : ''}`} />
          <span className="truncate">{line.text}</span>
        </span>
      </div>
    );
  }

  const sensei = line.role === 'sensei';
  return (
    <div className={`flex flex-col ${sensei ? 'items-start' : 'items-end text-right'}`} style={{ animation: 'sensei-fade-in 0.2s ease-out both' }}>
      <span className={`text-[10px] tracking-[0.3em] uppercase mb-1 ${sensei ? 'text-cyan-300/70' : 'text-zinc-500'}`}>
        {sensei ? 'Sensei' : 'You'}
      </span>
      <p className={`text-[17px] leading-snug max-w-[92%] ${sensei ? 'text-cyan-50' : 'text-zinc-100'} ${line.interrupted ? 'opacity-60' : ''}`}>
        {line.text}
        {line.interrupted && ' —'}
        {!line.final && (
          <span className="sensei-motion inline-block w-[2px] h-[1em] ml-0.5 align-[-2px] bg-current" style={{ animation: 'sensei-caret 0.9s steps(1) infinite' }} />
        )}
      </p>
    </div>
  );
}

function InCallView({ onFinished }: { onFinished: () => void }) {
  const [status, setStatus] = useState<CallStatus>('connecting');
  const [detail, setDetail] = useState<string>();
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const callRef = useRef<SenseiLiveCall | null>(null);
  const liveAt = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stateLabelRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const call = new SenseiLiveCall({
      onStatus: (s, d) => {
        setStatus(s);
        setDetail(d);
        if (s === 'live') liveAt.current = Date.now();
        if (s === 'ended' || s === 'error') {
          // Recap goes to Telegram history so the next text check-in can follow up on it
          const transcript = call.getTranscript().filter((l) => l.final && l.text.trim() && !(l.role === 'action' && !l.ok));
          if (transcript.some((l) => l.role === 'user')) {
            const durationSec = liveAt.current ? Math.round((Date.now() - liveAt.current) / 1000) : 0;
            fetch('/api/voice/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ durationSec, lines: transcript.map(({ role, text }) => ({ role, text })) }),
              keepalive: true,
            }).catch(() => {});
          }
        }
      },
      onTranscript: setLines,
      onBusy: setBusy,
    });
    callRef.current = call;
    void call.start();
    return () => call.hangup();
  }, []);

  // Call clock
  useEffect(() => {
    if (status !== 'live') return;
    const id = setInterval(() => liveAt.current && setElapsed(Math.floor((Date.now() - liveAt.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [status]);

  // Keep the newest subtitle in view
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines]);

  // Auto-close the "call ended" card
  useEffect(() => {
    if (status !== 'ended') return;
    const id = setTimeout(onFinished, 6000);
    return () => clearTimeout(id);
  }, [status, onFinished]);

  const getLevels = useCallback(() => {
    const l = callRef.current?.getLevels() ?? { mic: 0, speaker: 0 };
    // "Speaking / Listening" label follows the audio, written directly to avoid re-renders
    if (stateLabelRef.current && status === 'live' && !busy) {
      stateLabelRef.current.textContent = l.speaker > 0.04 ? 'Speaking' : muted ? 'Muted' : 'Listening';
    }
    return l;
  }, [status, busy, muted]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    callRef.current?.setMuted(next);
  };

  const done = status === 'ended' || status === 'error';
  const actions = lines.filter((l) => l.role === 'action' && l.final && l.ok);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5">
        <div>
          <p className="text-sm font-bold tracking-[0.3em] text-white">SENSEI</p>
          <p className="text-[11px] text-zinc-500 tabular-nums">{status === 'live' ? fmt(elapsed) : status === 'connecting' ? 'Connecting…' : status === 'error' ? 'Call failed' : 'Call ended'}</p>
        </div>
        {status === 'live' && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-cyan-300/30 text-[10px] tracking-[0.25em] text-cyan-200">
            <span className="sensei-motion w-1.5 h-1.5 rounded-full bg-red-400" style={{ animation: 'sensei-caret 1.2s steps(1) infinite' }} />
            LIVE
          </span>
        )}
      </div>

      {/* Orb + state */}
      <div className="flex flex-col items-center pt-2">
        <HudOrb getLevels={status === 'live' ? getLevels : undefined} size={176} />
        <p ref={stateLabelRef} className="mt-1 h-4 text-[11px] tracking-[0.3em] uppercase text-cyan-200/70">
          {status === 'connecting' ? 'Connecting' : busy ? 'Updating your data' : status === 'live' ? 'Listening' : ''}
        </p>
      </div>

      {/* Subtitles */}
      <div
        ref={scrollRef}
        aria-live="polite"
        className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4"
        style={{ maskImage: 'linear-gradient(to bottom, transparent 0, black 28px)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 28px)' }}
      >
        {lines.length === 0 && status !== 'error' && (
          <p className="text-center text-sm text-zinc-600 pt-8">Subtitles will appear here</p>
        )}
        {lines.map((l) => <SubtitleLine key={l.id} line={l} />)}
        {status === 'error' && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-red-400/30 bg-red-500/10 text-sm text-red-200">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{detail || 'The call could not continue.'}</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-6 pb-8 pt-3">
        {done ? (
          <div className="flex flex-col items-center gap-3" style={{ animation: 'sensei-fade-in 0.25s ease-out both' }}>
            <p className="text-sm text-zinc-400">
              {status === 'ended' ? `Call ended · ${fmt(elapsed)}` : 'Call failed'}
              {actions.length > 0 && ` · ${actions.length} update${actions.length > 1 ? 's' : ''} saved`}
            </p>
            <button onClick={onFinished} className="w-full max-w-xs py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-sm font-semibold text-white transition-colors">
              Close
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-10">
            <RoundButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} small
              className={muted ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'}>
              {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </RoundButton>
            <RoundButton label="End" onClick={() => callRef.current?.hangup()} className="bg-red-500/90 hover:bg-red-500 text-white">
              <PhoneOff className="w-6 h-6" />
            </RoundButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────────

export type CallPhase = 'ringing' | 'call';

export default function CallScreen({ phase, onAccept, onDecline, onSnooze, onMissed, onFinished }: {
  phase: CallPhase;
  onAccept: () => void;
  onDecline: () => void;
  onSnooze: (minutes: number) => void;
  onMissed: () => void;
  onFinished: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sensei check-in call"
      className="fixed inset-0 z-[10000] flex flex-col text-white"
      style={{
        background: 'radial-gradient(120% 70% at 50% 25%, #0b2530 0%, #05070d 55%, #020305 100%)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        animation: 'sensei-fade-in 0.3s ease-out both',
      }}
    >
      {/* Faint scanline grid for the HUD feel */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: 'linear-gradient(rgb(103 232 249) 1px, transparent 1px), linear-gradient(90deg, rgb(103 232 249) 1px, transparent 1px)', backgroundSize: '32px 32px' }}
      />
      <div className="relative flex-1 flex flex-col min-h-0 w-full max-w-md mx-auto">
        {phase === 'ringing'
          ? <RingView onAccept={onAccept} onDecline={onDecline} onSnooze={onSnooze} onMissed={onMissed} />
          : <InCallView onFinished={onFinished} />}
      </div>
    </div>
  );
}
