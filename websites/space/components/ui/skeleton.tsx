import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Loading placeholder. Prefer skeletons over spinners — they preview the
 * shape of the content that is arriving and keep layout stable.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
