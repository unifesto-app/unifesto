import type { CSSProperties } from "react";

/** Brand gradient applied as text fill: use as style={gradientText} */
export const gradientText: CSSProperties = {
  background: "linear-gradient(135deg, #3491ff, #0062ff)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

/** Brand gradient value (for use in background/border inline styles) */
export const brandGradient = "linear-gradient(135deg, #3491ff, #0062ff)";
