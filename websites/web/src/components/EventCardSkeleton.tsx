/* Mirrors EventCard's geometry so the grid doesn't reflow when data lands.
   The pulse is a time-like loop; reduced motion neutralises it globally. */
export default function EventCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col overflow-hidden rounded-3xl bg-night-2">
      <div className="aspect-[4/3] animate-pulse bg-paper/[0.04]" />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="h-4 w-4/5 animate-pulse rounded bg-paper/[0.07]" />
        <div className="h-3 w-2/5 animate-pulse rounded bg-paper/[0.05]" />
        <div className="mt-1 flex flex-col gap-2">
          <div className="h-3 w-3/5 animate-pulse rounded bg-paper/[0.05]" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-paper/[0.05]" />
        </div>
        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="h-4 w-12 animate-pulse rounded bg-paper/[0.07]" />
          <div className="h-3 w-10 animate-pulse rounded bg-paper/[0.05]" />
        </div>
      </div>
    </div>
  );
}
