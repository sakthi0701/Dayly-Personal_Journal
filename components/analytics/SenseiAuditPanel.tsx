'use client';

import { useState } from 'react';
import { Brain, Loader2, BarChart2, AlertTriangle, RefreshCw } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ExecutionData {
  totalPlanned: number;
  totalCompleted: number;
  strictFailed: number;
  alignmentPercentage: number;
  goalDeadlinesSummary: string;
  failedHabitsSummary: string;
}

export default function SenseiAuditPanel() {
  const [advice, setAdvice] = useState<string | null>(null);
  const [executionData, setExecutionData] = useState<ExecutionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'Sensei' | 'Task-Audit'>('Sensei');

  const runAudit = async (auditMode: 'Sensei' | 'Task-Audit' = mode) => {
    setLoading(true);
    setAdvice(null);
    setExecutionData(null);
    try {
      const res = await fetch('/api/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: auditMode }),
      });
      const data = await res.json();
      setAdvice(data.advice ?? 'Unable to generate audit.');
      setExecutionData(data.executionData ?? null);
    } catch (err) {
      console.error(err);
      setAdvice('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const alignedValue = executionData?.alignmentPercentage ?? 0;
  const orphanValue = 100 - alignedValue;
  const pieData = [
    { name: 'Goal-aligned tasks', value: alignedValue },
    { name: 'Orphan / busy work', value: orphanValue },
  ];
  const PIE_COLORS = ['#6366f1', '#52525b'];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5 text-violet-400" />
            <h2 className="text-sm font-semibold text-white">Sensei Audit</h2>
          </div>
          <p className="text-xs text-zinc-500 max-w-md">
            A ruthless 7-day autopsy: where your time actually went vs. where you said you wanted to go.
          </p>
        </div>
        {advice && (
          <button
            onClick={() => { setAdvice(null); setExecutionData(null); }}
            className="p-2 text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Clear"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2">
        {(['Sensei', 'Task-Audit'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2 px-4 rounded-xl text-xs font-semibold border transition-all ${
              mode === m
                ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
            }`}
          >
            {m === 'Sensei' ? '🧠 Holistic Autopsy' : '🎯 Task Alignment Audit'}
          </button>
        ))}
      </div>

      {/* CTA */}
      {!advice && !loading && (
        <button
          onClick={() => runAudit(mode)}
          className="w-full py-3 bg-gradient-to-r from-violet-600/80 to-indigo-600/80 hover:from-violet-500/80 hover:to-indigo-500/80 border border-violet-500/30 text-white font-semibold rounded-xl transition-all active:scale-[0.98] text-sm"
        >
          Run Holistic Audit →
        </button>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-10 space-y-3">
          <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
          <p className="text-sm text-zinc-500">Analyzing your execution record…</p>
        </div>
      )}

      {/* Results */}
      {advice && executionData && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Execution Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatChip
              label="Planned 🍅"
              value={String(executionData.totalPlanned)}
              color="text-zinc-300"
            />
            <StatChip
              label="Completed"
              value={String(executionData.totalCompleted)}
              color="text-emerald-400"
            />
            <StatChip
              label="Strict Fails"
              value={String(executionData.strictFailed)}
              color="text-red-400"
            />
            <StatChip
              label="Goal Aligned"
              value={`${executionData.alignmentPercentage}%`}
              color={executionData.alignmentPercentage >= 60 ? 'text-emerald-400' : 'text-amber-400'}
            />
          </div>

          {/* Two-column: AI Verdict + Pie Chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AI Verdict */}
            <div className="p-5 bg-zinc-950/70 rounded-xl border border-zinc-800/80 shadow-inner">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-violet-400 uppercase tracking-widest font-bold">The Sensei</span>
              </div>
              <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-zinc-300">
                {advice}
              </p>
            </div>

            {/* Pie Chart */}
            <div className="p-5 bg-zinc-950/70 rounded-xl border border-zinc-800/80 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <BarChart2 className="w-4 h-4 text-zinc-500" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Task Alignment (7d)</span>
              </div>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                      formatter={(val: number | undefined) => [`${val ?? 0}%`, '' as const]}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Habit Decay Table */}
          {executionData.failedHabitsSummary !== 'No habit decay detected.' && (
            <div className="p-4 bg-red-950/20 border border-red-900/30 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-xs text-red-400 font-semibold uppercase tracking-wider">Habit Decay Detected</span>
              </div>
              <ul className="space-y-1">
                {executionData.failedHabitsSummary.split(';').map((item, i) => (
                  <li key={i} className="text-xs text-red-300/80 pl-2 border-l border-red-800">
                    {item.trim()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Goal Deadlines */}
          {executionData.goalDeadlinesSummary !== 'No active goals set.' && (
            <div className="p-4 bg-zinc-950/50 border border-zinc-800 rounded-xl">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-2">⏳ Active Goal Deadlines</span>
              <ul className="space-y-1">
                {executionData.goalDeadlinesSummary.split(';').map((item, i) => (
                  <li key={i} className="text-xs text-zinc-400 pl-2 border-l border-zinc-700">
                    {item.trim()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Re-run button */}
          <button
            onClick={() => runAudit(mode)}
            className="w-full py-2 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 rounded-xl text-xs font-medium transition-colors"
          >
            Run again
          </button>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}
