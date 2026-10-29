import * as React from "react";
import { cn } from "@/console/lib/utils/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Text input following the calm-field spec: 1px border on the flat canvas,
 * brand ring on focus (no default shadow).
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground",
        "placeholder:text-muted-foreground",
        "transition-[border-color,box-shadow] duration-150 ease-standard",
        "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
