import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A block of an Apex page. Not a boxed panel: a hairline on top and its
 * content on the page's own ground, aligned to the page edge, the same look
 * as the console. Callers still add padding, tints or grids.
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "border-t border-border text-card-foreground",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

/* Header, content and footer sit flush with the hairline: a block has no box
   to pad inside, so any sideways padding a page passes (p-5, p-6, from when it
   did) is dropped. A tinted notice pads the Card itself (rounded-2xl border px-4). */
const FLUSH = "px-0";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1 py-5", className, FLUSH)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

/** Sized like an account page's section title. */
const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-base font-semibold leading-tight text-foreground",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("pb-6", className, FLUSH)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center pb-6", className, FLUSH)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
};
