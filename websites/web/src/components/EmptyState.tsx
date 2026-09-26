import { brandGradient } from "@/lib/styles";

interface EmptyStateProps {
  onClear: () => void;
  onCategory: (cat: string) => void;
}

const SUGGESTIONS = ["Hackathon", "Workshop", "Cultural", "Entrepreneurship"];

export default function EmptyState({ onClear, onCategory }: EmptyStateProps) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 text-center gap-4">
      {/* Illustration */}
      <div className="relative w-20 h-20 mb-2">
        <div className="absolute inset-0 rounded-full border border-white/5 animate-ping" style={{ animationDuration: "3s" }} />
        <div className="absolute inset-2 rounded-full border border-white/5" />
        <div className="absolute inset-4 rounded-full border border-white/5" />
        <div className="absolute inset-0 flex items-center justify-center text-3xl">🔍</div>
      </div>
      <div>
        <p className="text-lg font-bold text-white mb-1">No events found</p>
        <p className="text-sm text-slate-500 max-w-xs">Try a different search or filter. Here are some ideas:</p>
      </div>
      {/* Suggestions */}
      <div className="flex flex-wrap justify-center gap-2 mt-1">
        {SUGGESTIONS.map((cat) => (
          <button
            key={cat}
            onClick={() => onCategory(cat)}
            className="text-xs font-semibold px-3.5 py-1.5 rounded-full border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all duration-200"
          >
            {cat}
          </button>
        ))}
      </div>
      <button
        onClick={onClear}
        className="mt-1 text-sm font-semibold px-5 py-2 rounded-full text-black transition-all duration-200 hover:shadow-[0_0_20px_rgba(52,145,255,0.3)]"
        style={{ background: brandGradient }}
      >
        Explore all events
      </button>
    </div>
  );
}
