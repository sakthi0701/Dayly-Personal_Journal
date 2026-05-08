'use client';

import { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

const SOUNDS = [
  { label: 'White Noise', file: '/audio/white-noise.mp3' },
  { label: 'Brown Noise', file: '/audio/brown-noise.mp3' },
  { label: 'Rain',        file: '/audio/rain.mp3' },
];

export default function WhiteNoise() {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState(0);
  const [volume, setVolume] = useState(0.4);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(SOUNDS[selected].file);
      audioRef.current.loop = true;
      audioRef.current.volume = volume;
    }
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    if (active) {
      audioRef.current.src = SOUNDS[selected].file;
      audioRef.current.volume = volume;
      audioRef.current.play().catch(() => {
        // autoplay blocked — user needs to interact first
        setActive(false);
      });
    } else {
      audioRef.current.pause();
    }
    return () => {};
  }, [active, selected, volume]);

  return (
    <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5">
      {/* Toggle */}
      <button
        id="white-noise-toggle"
        onClick={() => setActive((v) => !v)}
        className={`p-1.5 rounded-lg transition-all ${active ? 'text-indigo-400 hover:text-indigo-300' : 'text-zinc-600 hover:text-zinc-400'}`}
        title={active ? 'Mute noise' : 'Play white noise'}
      >
        {active ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      </button>

      {/* Sound selector */}
      <div className="flex items-center gap-1">
        {SOUNDS.map((s, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`px-2 py-1 text-xs rounded-lg transition-all ${
              selected === i && active
                ? 'bg-indigo-600/30 text-indigo-300'
                : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Volume slider */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="w-20 h-1 accent-indigo-500 cursor-pointer"
        title="Volume"
      />
    </div>
  );
}
