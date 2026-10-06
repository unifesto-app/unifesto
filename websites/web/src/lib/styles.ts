import type { CSSProperties } from "react";

/* Legacy helpers, kept so existing call sites compile. The brand no longer
   uses gradients: both resolve to flat brand blue. Prefer the classes
   (text-primary, bg-primary, .btn-primary) in new code. */

/** Accent text colour (formerly gradient-clipped text). */
export const gradientText: CSSProperties = { color: "var(--primary)" };

/** Accent fill (formerly a blue gradient). */
export const brandGradient = "var(--primary)";
