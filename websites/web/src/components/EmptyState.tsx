import { MagnifyingGlass } from "@unifesto/unicon/react";

interface EmptyStateProps {
  onClear: () => void;
  onCategory: (cat: string) => void;
}

const SUGGESTIONS = ["Hackathon", "Workshop", "Cultural", "Entrepreneurship"];

/* No results: say so plainly, offer a way back, and a few doors to try. */
export default function EmptyState({ onClear, onCategory }: EmptyStateProps) {
  return (
    <div className="animate-pop-in col-span-full flex flex-col items-center justify-center gap-5 rounded-3xl bg-night-2 px-6 py-20 text-center">
      <MagnifyingGlass className="h-10 w-10 text-primary" weight="bold" aria-hidden="true" />
      <div>
        <p className="text-lg font-bold text-paper">No events match that.</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-paper/60">Try a different search, or one of these:</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((cat) => (
          <button
            key={cat}
            onClick={() => onCategory(cat)}
            className="rounded-full bg-paper/[0.06] px-4 py-1.5 text-xs font-semibold text-paper/75 transition-colors duration-150 hover:bg-paper/[0.1] hover:text-paper"
          >
            {cat}
          </button>
        ))}
      </div>
      <button onClick={onClear} className="btn btn-sm btn-primary">
        Show all events
      </button>
    </div>
  );
}
