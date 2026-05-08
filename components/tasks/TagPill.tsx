'use client';

interface Tag {
  id: string;
  name: string;
}

const TAG_COLORS = [
  { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/20' },
  { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/20' },
  { bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/20' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/20' },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

interface TagPillProps {
  tag: Tag;
  onRemove?: (id: string) => void;
  size?: 'sm' | 'xs';
}

export default function TagPill({ tag, onRemove, size = 'sm' }: TagPillProps) {
  const color = TAG_COLORS[hashString(tag.name) % TAG_COLORS.length];
  const padding = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium
        ${padding} ${color.bg} ${color.text} ${color.border}`}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(tag.id); }}
          className="ml-0.5 hover:opacity-70 transition-opacity leading-none"
          aria-label={`Remove tag ${tag.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
