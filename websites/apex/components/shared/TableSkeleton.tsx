import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  rows?: number;
  /** Show a leading round avatar/icon placeholder on each row. */
  avatar?: boolean;
}

/** Row-shaped loading placeholder — the calm alternative to a spinner. */
export function TableSkeleton({ rows = 8, avatar = false }: TableSkeletonProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          {avatar && <Skeleton className="h-8 w-8 rounded-full" />}
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
