/* Motion tokens shared by the marketing pages (mirrors the CSS vars in
   globals.css). Ease-out for things entering, ease-in-out for things already
   on screen that move. Marketing reveals may run long (illustrative tier). */
export const EASE_OUT_QUART = [0.165, 0.84, 0.44, 1] as const;
export const EASE_OUT_EXPO = [0.19, 1, 0.22, 1] as const;
export const EASE_IN_OUT_CUBIC = [0.645, 0.045, 0.355, 1] as const;

export const DUR = { press: 0.12, swap: 0.24, reveal: 0.7 } as const;
