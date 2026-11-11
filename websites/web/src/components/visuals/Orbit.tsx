/* The Unifesto Orbit Lead ID card shown beside the apply form. CSS only. Decorative. */

/* The Lead's campus ID: lanyard slot, a header band with the u-in-orbit
   mark, a holographic hairline, photo, name, campus, batch and blood group.
   Sample person. */
export function OrbitIdCard() {
  const rows: [string, string][] = [
    ["Name", "Ananya R."],
    ["Campus", "MRU"],
    ["City", "Hyderabad, Telangana"],
    ["Batch", "2023-27"],
    ["Blood group", "B+"],
  ];
  const face =
    "overflow-hidden rounded-xl bg-night-2 shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.08),0_30px_60px_-30px_rgba(0,0,0,0.9)] [backface-visibility:hidden]";
  // Click, tap or keyboard (the checkbox) flips the card; CSS only, so it
  // works in a server component. Reduced motion swaps without the spin.
  return (
    <label className="block w-full max-w-sm cursor-pointer [perspective:1200px]">
      <input type="checkbox" className="peer sr-only" aria-label="Flip the ID card to see the back" />
      <div className="relative transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] [transform-style:preserve-3d] peer-checked:[transform:rotateY(180deg)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-primary motion-reduce:transition-none">
    <div aria-hidden="true" className={`relative ${face}`}>
      {/* Faint orbit lines behind everything. */}
      <svg className="pointer-events-none absolute -right-16 -bottom-20 h-64 w-64 opacity-[0.07]" viewBox="0 0 200 200">
        <ellipse cx="100" cy="100" rx="95" ry="30" fill="none" stroke="currentColor" className="text-paper" strokeWidth="1" transform="rotate(-18 100 100)" />
        <ellipse cx="100" cy="100" rx="70" ry="22" fill="none" stroke="currentColor" className="text-paper" strokeWidth="1" transform="rotate(-18 100 100)" />
      </svg>

      <div className="flex justify-center pt-3">
        <span className="h-1.5 w-12 rounded-full bg-night shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]" />
      </div>

      <div className="mt-3 flex items-center justify-between px-4 py-2.5">
        <span className="flex items-center gap-2">
          <svg viewBox="0 0 64 40" className="h-6 w-10">
            <ellipse cx="32" cy="22" rx="27" ry="7" fill="none" stroke="rgb(var(--glow) / 0.45)" strokeWidth="1.2" transform="rotate(-18 32 22)" />
            <path d={U_PATH} fill="var(--primary-bright)" transform="translate(18.5 32) scale(0.38)" />
            <circle cx="55" cy="13" r="2" fill="var(--primary-bright)" />
          </svg>
        </span>
        <span className="text-[9px] uppercase tracking-[0.2em] text-paper/55">Orbit Lead</span>
      </div>
      <div className="h-px bg-[linear-gradient(90deg,#f6c4ff,#bfe8ff,#c9ffe7,#ffe9b8)] opacity-50" />

      <div className="relative flex gap-4 p-4">
        <div className="relative grid h-[104px] w-[82px] shrink-0 place-items-center overflow-hidden rounded-lg bg-[radial-gradient(120%_90%_at_80%_0%,rgb(var(--glow)/0.22),transparent_60%),linear-gradient(160deg,var(--sand),var(--night-2))]">
          <span className="font-display text-lg text-paper/70">AR</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 text-[10px]">
              <span className="text-paper/50">{k}</span>
              <span className="truncate text-paper">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex items-end justify-between gap-4 px-4 pb-4">
        <span className="text-[9px] leading-snug text-paper/50">Represents Unifesto, not the college.</span>
        <span className="flex h-6 items-stretch gap-[2px]">
          {[2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2].map((w, i) => (
            <span key={i} className="bg-paper/40" style={{ width: w }} />
          ))}
        </span>
      </div>
    </div>

    {/* Back: the programme name, the mark, and the return line. */}
    <div aria-hidden="true" className={`absolute inset-0 flex flex-col ${face} [transform:rotateY(180deg)]`}>
      <svg className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 opacity-[0.06]" viewBox="0 0 200 200">
        <ellipse cx="100" cy="100" rx="95" ry="30" fill="none" stroke="currentColor" className="text-paper" strokeWidth="1" transform="rotate(-18 100 100)" />
        <ellipse cx="100" cy="100" rx="70" ry="22" fill="none" stroke="currentColor" className="text-paper" strokeWidth="1" transform="rotate(-18 100 100)" />
      </svg>
      <div className="flex justify-center pt-3">
        <span className="h-1.5 w-12 rounded-full bg-night shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]" />
      </div>
      <div className="relative flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        {/* The brand wordmark from the press kit: silver on dark, ink on the light theme. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/press/wordmark-silver.svg" alt="Unifesto" className="h-7 w-auto [[data-theme=light]_&]:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/press/wordmark-ink.svg" alt="" className="hidden h-7 w-auto [[data-theme=light]_&]:block" />
        <span className="text-[9px] uppercase tracking-[0.24em] text-paper/50">Orbit • Campus programme</span>
      </div>
      <div className="h-px bg-[linear-gradient(90deg,#f6c4ff,#bfe8ff,#c9ffe7,#ffe9b8)] opacity-40" />
      <div className="relative flex items-center justify-between gap-4 px-4 py-3">
        <span className="text-[9px] leading-snug text-paper/50">If found, please return to orbit@unifesto.app</span>
        <span className="shrink-0 text-[9px] text-paper/40">Valid while an Orbit Lead</span>
      </div>
    </div>
      </div>
      <span className="mt-3 block text-center text-[11px] text-paper/45">Tap the card to flip it</span>
    </label>
  );
}

/** The Unifesto "u" symbol (brand kit path), glyph box x 3..69, y -46..1.6. */
export const U_PATH =
  "M 27.55 1.63 C 22.5 1.63 18.13 0.74 14.44 -1.03 C 10.75 -2.8 7.91 -5.34 5.94 -8.64 C 3.96 -11.94 2.97 -15.84 2.97 -20.34 L 2.97 -46.08 L 19.44 -46.08 L 19.44 -22.05 C 19.44 -17.79 20.75 -14.45 23.39 -12.05 C 26.04 -9.65 29.73 -8.45 34.47 -8.45 C 40.16 -8.45 44.62 -9.92 47.83 -12.86 C 51.05 -15.8 52.66 -19.92 52.66 -25.2 L 52.66 -46.08 L 69.03 -46.08 L 69.03 0 L 54.72 0 L 53.02 -11.44 L 52.92 -11.44 C 50.82 -7.41 47.56 -4.23 43.16 -1.89 C 38.75 0.45 33.55 1.63 27.55 1.63 Z";
