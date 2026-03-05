import Link from 'next/link'
import { PlusCircle, BookOpen, Compass, ArrowRight, Sparkles } from 'lucide-react'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center pt-32 pb-16 px-6 bg-zinc-950 text-white">
      {/* Hero Section */}
      <div className="relative flex flex-col items-center mb-20">
        {/* Subtle background glow */}
        <div className="absolute -top-20 w-[500px] h-[300px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        <h1 className="text-7xl sm:text-8xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-zinc-200 to-zinc-500 relative z-10">
          Dayly
        </h1>
        <p className="mt-4 text-xs sm:text-sm font-semibold tracking-[0.3em] uppercase text-zinc-500 relative z-10">
          Active Memory Journal
        </p>
      </div>

      {/* Navigation Cards */}
      <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
        {/* New Entry Card */}
        <Link
          href="/entries/new"
          className="group relative flex flex-col gap-4 p-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl transition-all duration-300 hover:border-zinc-600 hover:bg-zinc-800/50 hover:shadow-lg hover:shadow-indigo-500/5"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center">
            <PlusCircle className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">
              New Entry
            </h2>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Capture your thoughts for today
            </p>
          </div>
          <ArrowRight className="absolute top-6 right-6 w-4 h-4 text-zinc-700 transition-all group-hover:text-zinc-400 group-hover:translate-x-0.5" />
        </Link>

        {/* Past Entries Card */}
        <Link
          href="/entries"
          className="group relative flex flex-col gap-4 p-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl transition-all duration-300 hover:border-zinc-600 hover:bg-zinc-800/50 hover:shadow-lg hover:shadow-indigo-500/5"
        >
          <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-zinc-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">
              Past Entries
            </h2>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Revisit your journey and growth
            </p>
          </div>
          <ArrowRight className="absolute top-6 right-6 w-4 h-4 text-zinc-700 transition-all group-hover:text-zinc-400 group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* The Compass Card */}
      <div className="w-full max-w-3xl">
        <Link
          href="/dashboard"
          className="group relative flex flex-col sm:flex-row items-start gap-6 p-8 bg-gradient-to-br from-zinc-900/80 to-indigo-950/20 border border-zinc-800 rounded-2xl transition-all duration-300 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 overflow-hidden"
        >
          {/* Background accent */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex-1 relative z-10">
            <h2 className="text-xl font-bold text-indigo-400 flex items-center gap-2 mb-3">
              The Compass <Sparkles className="w-4 h-4 text-indigo-400/60" />
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-md mb-5">
              Navigate your memories with AI insights. Discover recurring patterns and hidden connections in your journey.
            </p>
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600/90 hover:bg-indigo-500 text-white text-sm font-medium rounded-full transition-all shadow-md shadow-indigo-500/10 group-hover:shadow-indigo-500/20">
              Explore Insights
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>

          {/* Compass Preview Graphic */}
          <div className="relative w-full sm:w-48 h-36 sm:h-40 bg-gradient-to-br from-zinc-800/50 to-indigo-900/30 border border-zinc-700/50 rounded-xl flex items-center justify-center shrink-0">
            <Compass className="w-10 h-10 text-indigo-400/60" />
          </div>
        </Link>
      </div>

      {/* Footer */}
      <footer className="mt-auto pt-20 text-center">
        <p className="text-xs text-zinc-700 tracking-widest uppercase">
          Designed for clarity &bull; &copy; {new Date().getFullYear()} Dayly
        </p>
      </footer>
    </main>
  )
}
