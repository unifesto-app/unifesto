"use client";

/**
 * Loading placeholder that mirrors EventCard's geometry so the grid doesn't
 * reflow when real data arrives. Uses a slow pulse; killed under reduced motion
 * by the global stylesheet (transition/animation durations are neutralised).
 */
export default function EventCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      <div className="h-40 animate-pulse bg-white/[0.04]" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="h-4 w-4/5 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-3 w-2/5 animate-pulse rounded bg-white/[0.05]" />
        <div className="mt-1 flex flex-col gap-2">
          <div className="h-3 w-3/5 animate-pulse rounded bg-white/[0.04]" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.04]" />
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-white/8 pt-3">
          <div className="h-4 w-12 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-3 w-10 animate-pulse rounded bg-white/[0.05]" />
        </div>
      </div>
    </div>
  );
}
