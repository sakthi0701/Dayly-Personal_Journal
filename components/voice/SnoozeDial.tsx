'use client';

import { useRef, useState, useCallback } from 'react';

const MIN = 5;
const MAX = 120;
const STEP = 5;
const R = 92;
const CIRC = 2 * Math.PI * R;
const PRESETS = [10, 15, 30, 60];

const toFrac = (m: number) => (m - MIN) / (MAX - MIN);
const fromFrac = (f: number) => Math.min(MAX, Math.max(MIN, MIN + Math.round((f * (MAX - MIN)) / STEP) * STEP));

interface Props {
  onSnooze: (minutes: number) => void;
  onBack: () => void;
}

/** Circular "ring" slider: drag the knob around the dial to pick how long to snooze. */
export default function SnoozeDial({ onSnooze, onBack }: Props) {
  const [minutes, setMinutes] = useState(15);
  const svgRef = useRef<SVGSVGElement>(null);
  const fracRef = useRef(toFrac(15));
  const dragging = useRef(false);

  const updateFromPointer = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    // 0 at 12 o'clock, increasing clockwise
    let f = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
    // Don't let the knob jump across the top seam (120 → 5 or 5 → 120)
    const prev = fracRef.current;
    if (prev > 0.75 && f < 0.25) f = 1;
    else if (prev < 0.25 && f > 0.75) f = 0;
    fracRef.current = f;
    setMinutes(fromFrac(f));
  }, []);

  const frac = toFrac(minutes);
  const angle = frac * 2 * Math.PI;
  const knobX = 120 + R * Math.sin(angle);
  const knobY = 120 - R * Math.cos(angle);

  const pick = (m: number) => {
    fracRef.current = toFrac(m);
    setMinutes(m);
  };

  return (
    <div className="flex flex-col items-center gap-5" style={{ animation: 'sensei-fade-in 0.25s ease-out both' }}>
      <p className="text-[11px] tracking-[0.3em] text-cyan-300/70 uppercase">Snooze check-in</p>

      <svg
        ref={svgRef}
        viewBox="0 0 240 240"
        className="w-56 h-56 touch-none select-none cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
        role="slider"
        aria-label="Snooze minutes"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={minutes}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') pick(Math.min(MAX, minutes + STEP));
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') pick(Math.max(MIN, minutes - STEP));
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          updateFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => dragging.current && updateFromPointer(e.clientX, e.clientY)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {/* Tick marks every 5 min */}
        {Array.from({ length: (MAX - MIN) / STEP + 1 }, (_, i) => {
          const a = (i / ((MAX - MIN) / STEP)) * 2 * Math.PI;
          const major = (MIN + i * STEP) % 30 === 0;
          const r1 = major ? 106 : 109;
          return (
            <line
              key={i}
              x1={120 + r1 * Math.sin(a)} y1={120 - r1 * Math.cos(a)}
              x2={120 + 114 * Math.sin(a)} y2={120 - 114 * Math.cos(a)}
              stroke="rgb(103 232 249)" strokeOpacity={major ? 0.6 : 0.25} strokeWidth={major ? 2 : 1}
            />
          );
        })}
        <circle cx="120" cy="120" r={R} fill="none" stroke="rgb(34 211 238 / 0.12)" strokeWidth="10" />
        <circle
          cx="120" cy="120" r={R} fill="none"
          stroke="rgb(34 211 238)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${Math.max(0.001, frac) * CIRC} ${CIRC}`}
          transform="rotate(-90 120 120)"
          style={{ filter: 'drop-shadow(0 0 6px rgb(34 211 238 / 0.6))' }}
        />
        <circle cx={knobX} cy={knobY} r="13" fill="#05070d" stroke="rgb(165 243 252)" strokeWidth="3" />
        <text x="120" y="122" textAnchor="middle" className="fill-white" style={{ fontSize: 52, fontWeight: 700 }}>
          {minutes}
        </text>
        <text x="120" y="150" textAnchor="middle" style={{ fontSize: 12, letterSpacing: 4 }} className="fill-cyan-200/70">
          MINUTES
        </text>
      </svg>

      <div className="flex gap-2">
        {PRESETS.map((m) => (
          <button
            key={m}
            onClick={() => pick(m)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              minutes === m
                ? 'bg-cyan-400/20 border-cyan-300/60 text-cyan-100'
                : 'border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/25'
            }`}
          >
            {m}m
          </button>
        ))}
      </div>

      <div className="flex gap-3 w-full max-w-xs">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-2xl border border-white/10 text-sm text-zinc-300 hover:bg-white/5 transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => onSnooze(minutes)}
          className="flex-1 py-3 rounded-2xl bg-cyan-400 text-sm font-bold text-zinc-950 hover:bg-cyan-300 transition-colors"
        >
          Snooze {minutes}m
        </button>
      </div>
    </div>
  );
}
