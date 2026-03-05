'use client';

export const MOODS = [
    { label: 'Confident', emoji: '🦁' },
    { label: 'Happy', emoji: '🙂' },
    { label: 'Chill', emoji: '😎' },
    { label: 'Tired', emoji: '🥱' },
    { label: 'Anxious', emoji: '😟' },
    { label: 'Sad', emoji: '🌧️' },
];

export default function MoodSelector({
    selectedMood,
    onSelect
}: {
    selectedMood: string | null;
    onSelect: (mood: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-2 mb-4 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <span className="text-zinc-500 text-sm font-medium mr-2 flex items-center">Mood:</span>
            {MOODS.map((m) => (
                <button
                    key={m.label}
                    onClick={() => onSelect(m.emoji)}
                    title={m.label}
                    className={`text-2xl hover:scale-110 transition-transform px-2 py-1 rounded-lg ${selectedMood === m.emoji ? 'bg-zinc-700 ring-2 ring-indigo-500' : 'hover:bg-zinc-800'}`}
                >
                    {m.emoji}
                </button>
            ))}
        </div>
    );
}
