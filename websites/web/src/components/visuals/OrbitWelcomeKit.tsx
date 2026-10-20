/* The Orbit Lead welcome kit as a top-down product shot: a tissue-lined box
   holding a folded hoodie, the Orbit Playbook, a welcome letter on its sealed
   envelope, a sticker sheet, and the small stuff (enamel pins, phone grip,
   acrylic keychain). Numbered markers match the list under it on the page.
   A fixed dark stage so it reads the same in both themes. Decorative. */

const FOIL = "url(#kit-foil)";
const LEAD = "#8fa8ff";

function Marker({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g filter="url(#kit-shadow-sm)">
      <circle cx={x} cy={y} r="19" fill="#f4f2ec" />
      <text x={x} y={y + 6.5} textAnchor="middle" fill="#121318" fontSize="18" fontWeight="600">
        {n}
      </text>
    </g>
  );
}

/** Planet + ring + moon, the Orbit mark. */
function Mark({ x, y, s = 1, fill = FOIL, stroke = FOIL }: { x: number; y: number; s?: number; fill?: string; stroke?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse rx="27" ry="8.5" fill="none" stroke={stroke} strokeWidth="2.4" transform="rotate(-18)" />
      <circle r="10.5" fill={fill} />
      <circle cx="25" cy="-7.5" r="3.2" fill={fill} />
    </g>
  );
}

/* Garments as technical line art on dark fleece: an outline, seams, twin-needle
   topstitching, rib lines, creases and light sketch hatching in the shadows.
   Original drawings in the style of a fashion flat. */

const FLEECE = "#1b1d23";
const LINE = "rgba(214,217,226,0.42)"; // outlines
const SEAM_L = "rgba(214,217,226,0.3)"; // seams
const STITCH_L = "rgba(214,217,226,0.2)"; // topstitching
const SOFT = "rgba(214,217,226,0.12)"; // creases, ribs, hatching

const stitch = { stroke: STITCH_L, strokeWidth: 1, strokeDasharray: "3.5 3.5", fill: "none" } as const;

/** Vertical rib lines across a band whose top and bottom edges are straight. */
function Ribs({ x1, x2, y1, y2, n, slant = 0 }: { x1: number; x2: number; y1: number; y2: number; n: number; slant?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const t = (i + 1) / (n + 1);
        const x = x1 + (x2 - x1) * t;
        return <line key={i} x1={x} y1={y1 + 3} x2={x + slant} y2={y2 - 3} stroke={SOFT} strokeWidth="1.2" />;
      })}
    </>
  );
}

/** Short parallel sketch strokes, for shadows. */
function Hatch({ x, y, n, angle = -55, len = 16, gap = 6 }: { x: number; y: number; n: number; angle?: number; len?: number; gap?: number }) {
  const r = (angle * Math.PI) / 180;
  const dx = Math.cos(r) * len;
  const dy = Math.sin(r) * len;
  return (
    <g stroke={SOFT} strokeWidth="1" strokeLinecap="round">
      {Array.from({ length: n }, (_, i) => (
        <line key={i} x1={x + i * gap} y1={y} x2={x + i * gap + dx} y2={y + dy} />
      ))}
    </g>
  );
}

/** The Unifesto "u" symbol (brand kit path), glyph box x 3..69, y -46..1.6. */
const U_PATH =
  "M 27.55 1.63 C 22.5 1.63 18.13 0.74 14.44 -1.03 C 10.75 -2.8 7.91 -5.34 5.94 -8.64 C 3.96 -11.94 2.97 -15.84 2.97 -20.34 L 2.97 -46.08 L 19.44 -46.08 L 19.44 -22.05 C 19.44 -17.79 20.75 -14.45 23.39 -12.05 C 26.04 -9.65 29.73 -8.45 34.47 -8.45 C 40.16 -8.45 44.62 -9.92 47.83 -12.86 C 51.05 -15.8 52.66 -19.92 52.66 -25.2 L 52.66 -46.08 L 69.03 -46.08 L 69.03 0 L 54.72 0 L 53.02 -11.44 L 52.92 -11.44 C 50.82 -7.41 47.56 -4.23 43.16 -1.89 C 38.75 0.45 33.55 1.63 27.55 1.63 Z";

const PRINT = "rgba(214,217,226,0.34)"; // tonal screen print for the campus art

/** A fine line-art campus: trees, an arcade, a clock tower with its own
 *  orbit, a domed hall with a flag, a side block. Centred on cx, sits on base. */
function CampusSkyline({ cx, base, s = 1 }: { cx: number; base: number; s?: number }) {
  return (
    <g transform={`translate(${cx} ${base}) scale(${s})`} fill="none" stroke={PRINT} strokeWidth={1.1 / s} strokeLinecap="round" strokeLinejoin="round">
      <path d="M-104 0 L104 0" />
      {/* Trees. */}
      <path d="M-92 0 L-92 -9 M94 0 L94 -8" />
      <circle cx="-92" cy="-15" r="7" />
      <circle cx="94" cy="-13.5" r="6" />
      {/* Arcade. */}
      <path d="M-80 0 L-80 -18 L-40 -18 L-40 0" />
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${-76 + i * 12.5} 0 L${-76 + i * 12.5} -8 A4.25 4.25 0 0 1 ${-67.5 + i * 12.5} -8 L${-67.5 + i * 12.5} 0`} />
      ))}
      {/* Clock tower with an orbit around its spire. */}
      <path d="M-33 0 L-33 -46 L-15 -46 L-15 0 M-35 -46 L-24 -60 L-13 -46" />
      <circle cx="-24" cy="-36" r="4" />
      <path d="M-24 -36 L-24 -38.5 M-24 -36 L-22.3 -35" />
      <path d="M-28 -24 L-28 -16 M-20 -24 L-20 -16" />
      <ellipse cx="-24" cy="-57" rx="17" ry="4" transform="rotate(-14 -24 -57)" />
      <circle cx="-8" cy="-61" r="1.6" fill={PRINT} />
      {/* Domed hall with columns and a flag. */}
      <path d="M-10 0 L-10 -24 L46 -24 L46 0 M-12 -24 L48 -24" />
      <path d="M2 -24 A16 16 0 0 1 34 -24" />
      <path d="M18 -40 L18 -50 M18 -50 L26 -47.5 L18 -45" />
      {[-4, 6, 16, 26, 36].map((x) => (
        <path key={x} d={`M${x} -20 L${x} -2`} />
      ))}
      {/* Side block with windows. */}
      <path d="M52 0 L52 -16 L82 -16 L82 0" />
      {[56, 64, 72].map((x) => (
        <path key={x} d={`M${x} -11 L${x + 5} -11 M${x} -6 L${x + 5} -6`} />
      ))}
      {/* A few stars over campus. */}
      <path d="M-58 -40 l0 5 M-60.5 -37.5 l5 0 M62 -36 l0 4 M60 -34 l4 0" />
    </g>
  );
}

/** Chest print: the "u" in foil inside a thin orbit, "orbit" set beneath,
 *  then the campus line art. */
function ChestPrint({ y }: { y: number }) {
  const s = 0.82;
  return (
    <>
      {/* The ring passes behind the u; its moon sits on the ring, upper right. */}
      <ellipse cx="395" cy={y - 18} rx="54" ry="14" fill="none" stroke="rgba(214,217,226,0.55)" strokeWidth="1.4" transform={`rotate(-14 395 ${y - 18})`} />
      <circle cx="432" cy={y - 37} r="3.2" fill={FOIL} />
      <path d={U_PATH} fill={FOIL} transform={`translate(${395 - 36 * s} ${y}) scale(${s})`} />
      <text x="395" y={y + 34} textAnchor="middle" fill={FOIL} fontSize="22" letterSpacing="2" className="font-display">orbit</text>
      <CampusSkyline cx={395} base={y + 104} s={0.86} />
    </>
  );
}

/** A small woven brand tag, sewn onto a hem. */
function HemTag({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="38" height="15" rx="2" fill="rgba(214,217,226,0.1)" stroke={PRINT} strokeWidth="1" />
      <text x={x + 19} y={y + 10.5} textAnchor="middle" fill="rgba(214,217,226,0.6)" fontSize="6.5" letterSpacing="1.5">ORBIT</text>
    </g>
  );
}

/** Oversized pullover hoodie, front view: three-panel hood, dropped shoulders,
 *  kangaroo pocket, ribbed cuffs and hem. */
function Hoodie() {
  const body =
    "M318 262 L248 284 C224 300 214 330 210 380 L176 690 L242 700 L276 430 L282 702 L508 702 L514 430 L548 700 L614 690 L580 380 C576 330 566 300 542 284 L472 262";
  const hood = "M312 270 C292 206 318 138 395 126 C472 138 498 206 478 270";
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* Hood shell and body, filled, one soft shadow. */}
      <g filter="url(#kit-shadow-md)">
        <path d={`${hood} Z`} fill={FLEECE} />
        <path d={`${body} Z`} fill={FLEECE} />
      </g>

      {/* Hood: outline, centre panel, facing and lining. */}
      <path d={hood} fill="none" stroke={LINE} strokeWidth="1.2" />
      <path d="M380 129 C372 150 368 168 366 186 M410 129 C418 150 422 168 424 186" fill="none" stroke={SEAM_L} strokeWidth="1.3" />
      <path d="M385 130 C378 150 374 168 372 184 M405 130 C412 150 416 168 418 184" {...stitch} />
      <path d="M340 268 C330 218 352 172 395 166 C438 172 460 218 450 268 C428 290 362 290 340 268 Z" fill="#0d0e12" stroke={LINE} strokeWidth="1.1" />
      <path d="M348 264 C340 222 360 182 395 176 C430 182 450 222 442 264" {...stitch} />
      <path d="M356 262 C352 230 368 198 395 194 C422 198 438 230 434 262" fill="none" stroke={SOFT} strokeWidth="1" />
      {/* Neck label inside the hood. */}
      <rect x="383" y="198" width="24" height="12" rx="2" fill="none" stroke={SEAM_L} strokeWidth="1" />
      <line x1="388" y1="204" x2="402" y2="204" stroke={SOFT} strokeWidth="1" />
      <Hatch x={360} y={252} n={6} gap={9} len={12} />

      {/* Body outline. */}
      <path d={body} fill="none" stroke={LINE} strokeWidth="1.2" />
      <path d="M318 262 C326 272 334 276 340 276 M472 262 C464 272 456 276 450 276" fill="none" stroke={SEAM_L} strokeWidth="1.3" />

      {/* Dropped-shoulder armhole seams with topstitching. */}
      <path d="M262 290 C272 340 276 384 276 430 M528 290 C518 340 514 384 514 430" fill="none" stroke={SEAM_L} strokeWidth="1.4" />
      <path d="M268 291 C278 340 282 384 282 428 M522 291 C512 340 508 384 508 428" {...stitch} />

      {/* Creases: armpits, elbows, body. */}
      <g fill="none" stroke={SOFT} strokeWidth="1.1">
        <path d="M286 446 C300 470 300 500 292 520 M504 446 C490 470 490 500 498 520" />
        <path d="M214 470 C226 478 238 478 250 470 M210 500 C224 510 238 508 248 498" />
        <path d="M576 470 C564 478 552 478 540 470 M580 500 C566 510 552 508 542 498" />
        <path d="M232 560 C238 600 236 620 228 640 M558 560 C552 600 554 620 562 640" />
      </g>
      <Hatch x={288} y={520} n={5} angle={-60} len={14} gap={5} />
      <Hatch x={484} y={520} n={5} angle={-120} len={14} gap={5} />

      {/* Ribbed cuffs: seam, twin stitch, ribs. */}
      <path d="M182 640 L244 650 M546 650 L608 640" stroke={SEAM_L} strokeWidth="1.4" />
      <path d="M183 646 L243 656 M547 656 L607 646" {...stitch} />
      <Ribs x1={180} x2={244} y1={650} y2={698} n={8} slant={-3} />
      <Ribs x1={546} x2={612} y1={650} y2={698} n={8} slant={3} />

      {/* Ribbed hem band. */}
      <path d="M282 650 L508 650" stroke={SEAM_L} strokeWidth="1.4" />
      <path d="M282 656 L508 656" {...stitch} />
      <Ribs x1={282} x2={508} y1={652} y2={702} n={30} />

      {/* Kangaroo pocket: twin-stitched edges, angled openings, bartacks. */}
      <path d="M330 540 L460 540 L486 616 L486 650 M330 540 L304 616 L304 650" fill="none" stroke={SEAM_L} strokeWidth="1.4" />
      <path d="M334 546 L456 546 M334 546 L311 614 M456 546 L479 614" {...stitch} />
      <path d="M304 616 L314 612 M486 616 L476 612 M327 548 L333 540 M463 548 L457 540" stroke={LINE} strokeWidth="1.8" />
      <Hatch x={308} y={640} n={6} angle={-35} len={12} gap={7} />

      {/* Eyelets with grommets; drawstrings as cords with outlined tips. */}
      {[378, 412].map((x) => (
        <g key={x}>
          <circle cx={x} cy="282" r="6" fill="#0d0e12" stroke={LINE} strokeWidth="1.4" />
          <circle cx={x} cy="282" r="2.6" fill="none" stroke={SEAM_L} strokeWidth="1" />
        </g>
      ))}
      <g fill="none" stroke={LINE} strokeWidth="1.3">
        <path d="M375 288 C371 314 377 330 369 346 M381 288 C377 314 383 330 375 346" />
        <path d="M409 288 C415 314 407 332 417 348 M415 288 C421 314 413 332 423 348" />
      </g>
      <rect x="365" y="344" width="11" height="20" rx="3" fill={FLEECE} stroke={LINE} strokeWidth="1.3" transform="rotate(12 371 354)" />
      <rect x="414" y="346" width="11" height="20" rx="3" fill={FLEECE} stroke={LINE} strokeWidth="1.3" transform="rotate(-10 420 356)" />

      <ChestPrint y={420} />
      <HemTag x={292} y={680} />
    </g>
  );
}

/** Folded crew-neck tee: square fold, ribbed collar with back-neck tape,
 *  shoulder seams, side and bottom folds sketched in. */
function Tee() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <g filter="url(#kit-shadow-md)">
        <rect x="200" y="300" width="390" height="440" rx="20" fill={FLEECE} />
      </g>
      <rect x="200" y="300" width="390" height="440" rx="20" fill="none" stroke={LINE} strokeWidth="1.2" />

      {/* Sleeves folded under: side fold lines with creases and hatching. */}
      <path d="M232 322 C228 420 230 560 234 720 M558 322 C562 420 560 560 556 720" fill="none" stroke={SEAM_L} strokeWidth="1.2" />
      <path d="M218 380 C222 400 222 420 218 440 M572 380 C568 400 568 420 572 440 M220 560 C224 590 224 610 220 640 M570 560 C566 590 566 610 570 640" fill="none" stroke={SOFT} strokeWidth="1" />
      <Hatch x={206} y={700} n={4} angle={-60} len={18} gap={5} />
      <Hatch x={566} y={700} n={4} angle={-120} len={18} gap={5} />

      {/* Bottom fold with the hem's twin stitch showing above it. */}
      <path d="M214 700 C330 708 460 708 576 700" fill="none" stroke={SEAM_L} strokeWidth="1.2" />
      <path d="M218 688 C330 695 460 695 572 688" {...stitch} />
      {Array.from({ length: 22 }, (_, i) => (
        <line key={i} x1={226 + i * 16} y1="712" x2={220 + i * 16} y2="732" stroke={SOFT} strokeWidth="1" />
      ))}

      {/* Shoulder seams running out from the collar. */}
      <path d="M318 304 L214 330 M472 304 L576 330" stroke={SEAM_L} strokeWidth="1.3" />
      <path d="M320 310 L222 336 M470 310 L568 336" {...stitch} />

      {/* Ribbed crew collar: back neck and tape inside, ring with ribs, twin stitch. */}
      <path d="M318 300 C330 276 460 276 472 300 C468 366 322 366 318 300 Z" fill={FLEECE} stroke={LINE} strokeWidth="1.1" />
      <path d="M334 300 C346 288 444 288 456 300 C450 346 340 346 334 300 Z" fill="#0d0e12" stroke={SEAM_L} strokeWidth="1.3" />
      <path d="M342 300 C354 293 436 293 448 300" {...stitch} />
      <rect x="383" y="296" width="24" height="11" rx="2" fill="none" stroke={SEAM_L} strokeWidth="1" />
      {Array.from({ length: 34 }, (_, i) => {
        const t = (i + 0.5) / 34;
        const x = 320 + t * 150;
        const y = 300 + Math.sin(Math.PI * t) * 49;
        return <line key={i} x1={x} y1={y + 3} x2={x + (x - 395) * 0.04} y2={y - 9} stroke={SOFT} strokeWidth="1" />;
      })}
      <path d="M326 302 C332 358 458 358 464 302" {...stitch} />

      <ChestPrint y={452} />
      <HemTag x={230} y={668} />
    </g>
  );
}

function Garment({ lead }: { lead: boolean }) {
  return lead ? <Hoodie /> : <Tee />;
}

export type KitEdition = "lead" | "crew";

export function OrbitWelcomeKit({ edition = "lead" }: { edition?: KitEdition }) {
  const lead = edition === "lead";
  return (
    <div aria-hidden="true" className="relative w-full overflow-hidden rounded-[28px] shadow-[0_50px_100px_-50px_rgba(0,0,0,1)]">
      <svg viewBox="0 0 1600 900" className="block h-auto w-full">
        <defs>
          {/* Light and materials. */}
          <radialGradient id="kit-stage" cx="38%" cy="28%" r="85%">
            <stop offset="0%" stopColor="#25272f" />
            <stop offset="60%" stopColor="#121318" />
            <stop offset="100%" stopColor="#08090b" />
          </radialGradient>
          <linearGradient id="kit-tissue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1d1f26" />
            <stop offset="100%" stopColor="#14151a" />
          </linearGradient>
          <linearGradient id="kit-foil" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f6f7fa" />
            <stop offset="45%" stopColor="#a9aebb" />
            <stop offset="70%" stopColor="#eceef3" />
            <stop offset="100%" stopColor="#8d92a0" />
          </linearGradient>
          <linearGradient id="kit-hoodie" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor="#2b2d35" />
            <stop offset="100%" stopColor="#1a1b21" />
          </linearGradient>
          <linearGradient id="kit-hood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#30323b" />
            <stop offset="100%" stopColor="#23252c" />
          </linearGradient>
          <radialGradient id="kit-lining" cx="50%" cy="20%" r="80%">
            <stop offset="0%" stopColor="#0b0c0f" />
            <stop offset="100%" stopColor="#17181d" />
          </radialGradient>
          <linearGradient id="kit-book" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#24316a" />
            <stop offset="100%" stopColor="#111935" />
          </linearGradient>
          <linearGradient id="kit-paper" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fbfaf6" />
            <stop offset="100%" stopColor="#e9e6de" />
          </linearGradient>
          <linearGradient id="kit-envelope" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e6e1d6" />
            <stop offset="100%" stopColor="#cfc9bb" />
          </linearGradient>
          <radialGradient id="kit-wax" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#4a5cb4" />
            <stop offset="100%" stopColor="#1d2758" />
          </radialGradient>
          <linearGradient id="kit-holo" x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0%" stopColor="#f6c4ff" />
            <stop offset="33%" stopColor="#bfe8ff" />
            <stop offset="66%" stopColor="#c9ffe7" />
            <stop offset="100%" stopColor="#ffe9b8" />
          </linearGradient>
          <radialGradient id="kit-planet" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor={LEAD} />
          </radialGradient>
          <linearGradient id="kit-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fbe7a9" />
            <stop offset="50%" stopColor="#c99a3a" />
            <stop offset="100%" stopColor="#f2d78a" />
          </linearGradient>
          <linearGradient id="kit-acrylic" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#b9c7ff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#6f86ff" stopOpacity="0.25" />
          </linearGradient>

          <filter id="kit-shadow" x="-25%" y="-25%" width="150%" height="160%">
            <feDropShadow dx="0" dy="22" stdDeviation="22" floodColor="#000" floodOpacity="0.6" />
          </filter>
          <filter id="kit-shadow-md" x="-25%" y="-25%" width="150%" height="160%">
            <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#000" floodOpacity="0.5" />
          </filter>
          <filter id="kit-shadow-sm" x="-40%" y="-40%" width="180%" height="190%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.45" />
          </filter>
          <filter id="kit-noise" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0.09" />
            </feComponentTransfer>
          </filter>
          <filter id="kit-inner" x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation="16" />
          </filter>

          <clipPath id="kit-inside">
            <rect x="106" y="108" width="1388" height="700" rx="22" />
          </clipPath>
        </defs>

        {/* Stage. */}
        <rect width="1600" height="900" fill="url(#kit-stage)" />
        <text x="84" y="58" fill="rgba(236,235,230,0.42)" fontSize="15" letterSpacing="5">UNIFESTO ORBIT</text>
        <text x="1516" y="58" textAnchor="end" fill="rgba(236,235,230,0.3)" fontSize="15" letterSpacing="5">{lead ? "WELCOME KIT · LEAD EDITION" : "WELCOME KIT · CREW EDITION"}</text>

        {/* The box: rim, tissue floor, inner shadow, a few crinkles. */}
        <g filter="url(#kit-shadow)">
          <rect x="80" y="82" width="1440" height="752" rx="34" fill="#0f1014" />
        </g>
        <rect x="80" y="82" width="1440" height="752" rx="34" fill="none" stroke="rgba(236,235,230,0.08)" strokeWidth="2" />
        <rect x="106" y="108" width="1388" height="700" rx="22" fill="url(#kit-tissue)" />
        <g clipPath="url(#kit-inside)">
          <rect x="106" y="108" width="1388" height="700" fill="#fff" filter="url(#kit-noise)" opacity="0.8" />
          <path d="M106 300 L640 108 L760 108 L106 420 Z M1494 520 L1020 808 L1140 808 L1494 640 Z M520 808 L1000 330 L1060 330 L600 808 Z" fill="#fff" opacity="0.025" />
          <rect x="106" y="108" width="1388" height="700" rx="22" fill="none" stroke="#000" strokeOpacity="0.75" strokeWidth="44" filter="url(#kit-inner)" />
        </g>

        {/* Everything in the box, scaled to sit with breathing room. */}
        <g transform="translate(800 458) scale(0.86) translate(-800 -458)">
        {/* 1 · Folded hoodie (Lead) or tee (Crew). */}
        {/* Crew: the tee sits centred on the left instead of low. */}
        <g transform={lead ? undefined : "translate(30 -70)"}>
          <Garment lead={lead} />
        </g>

        {lead && (
        <>
        {/* 2 · The Orbit Playbook, hardcover. */}
        <g transform="rotate(-6 860 330)">
          <g filter="url(#kit-shadow)">
            <rect x="712" y="132" width="306" height="402" rx="8" fill="#e7e1d2" />
          </g>
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1="1012" y1={140 + i * 2} x2="1012" y2={526 - i * 2} stroke="#bdb6a4" strokeWidth="1" transform={`translate(${-i * 2} 0)`} />
          ))}
          <rect x="700" y="124" width="306" height="402" rx="10" fill="url(#kit-book)" />
          <rect x="700" y="124" width="306" height="402" rx="10" fill="#fff" filter="url(#kit-noise)" opacity="0.6" />
          <rect x="700" y="124" width="34" height="402" rx="10" fill="#0c1230" opacity="0.65" />
          <line x1="736" y1="130" x2="736" y2="520" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
          <path d="M880 524 L880 600 L897 584 L914 600 L914 524" fill="#c9ccd6" />
          <g opacity="0.9">
            <ellipse cx="868" cy="262" rx="88" ry="28" fill="none" stroke="#000" strokeOpacity="0.4" strokeWidth="3" transform="rotate(-18 868 262)" />
            <ellipse cx="866" cy="260" rx="88" ry="28" fill="none" stroke={FOIL} strokeWidth="3" transform="rotate(-18 866 260)" />
            <circle cx="866" cy="260" r="32" fill={FOIL} />
            <circle cx="948" cy="232" r="8" fill={FOIL} />
          </g>
          <text x="869" y="382" textAnchor="middle" fill="#000" fillOpacity="0.4" fontSize="22" letterSpacing="8">THE ORBIT</text>
          <text x="868" y="380" textAnchor="middle" fill={FOIL} fontSize="22" letterSpacing="8">THE ORBIT</text>
          <text x="869" y="428" textAnchor="middle" fill="#000" fillOpacity="0.4" fontSize="40" className="font-display">Playbook</text>
          <text x="868" y="426" textAnchor="middle" fill={FOIL} fontSize="40" className="font-display">Playbook</text>
          <text x="868" y="496" textAnchor="middle" fill="rgba(236,235,230,0.5)" fontSize="13" letterSpacing="4">UNIFESTO</text>
        </g>

        </>
        )}

        <g transform={lead ? undefined : "translate(-24 -178)"}>
        {/* 3 · Welcome letter on its sealed envelope. */}
        <g transform="rotate(7 960 690)" filter="url(#kit-shadow-md)">
          <rect x="800" y="580" width="330" height="214" rx="8" fill="url(#kit-envelope)" />
          <path d="M800 588 L965 702 L1130 588" fill="none" stroke="#b9b2a2" strokeWidth="2" />
          <path d="M800 794 L935 690 M1130 794 L995 690" fill="none" stroke="#c4bdae" strokeWidth="1.5" />
        </g>
        <g transform="rotate(7 960 690)">
          <path d="M965 669 c9 0 13 6 21 7 s10 9 10 18 -4 13 -6 20 -9 13 -18 14 -14 4 -21 2 -14 -9 -17 -16 -6 -12 -3 -20 7 -14 14 -19 12 -6 20 -6z" fill="url(#kit-wax)" filter="url(#kit-shadow-sm)" />
          <circle cx="965" cy="702" r="20" fill="none" stroke="#7f8fe0" strokeOpacity="0.6" strokeWidth="1.5" />
          <Mark x={965} y={703} s={0.5} fill="#c9d3ff" stroke="#c9d3ff" />
        </g>
        <g transform="rotate(-4 870 640)" filter="url(#kit-shadow-md)">
          <rect x="736" y="470" width="276" height="330" rx="4" fill="url(#kit-paper)" />
        </g>
        <g transform="rotate(-4 870 640)">
          <text x="762" y="508" fill="#121318" fontSize="16" className="font-display">unifesto</text>
          <text x="986" y="508" textAnchor="end" fill="#121318" fillOpacity="0.45" fontSize="10" letterSpacing="3">ORBIT</text>
          <line x1="762" y1="522" x2="986" y2="522" stroke="#121318" strokeOpacity="0.15" strokeWidth="1.5" />
          <text x="762" y="566" fill="#121318" fontSize="23" className="font-display">Welcome to</text>
          <text x="762" y="596" fill="#121318" fontSize="23" className="font-display">Orbit, Ananya.</text>
          {[218, 200, 214, 186, 206, 140].map((w, i) => (
            <rect key={i} x="762" y={620 + i * 19} width={w} height="6" rx="3" fill="#121318" opacity="0.13" />
          ))}
          <path d="M764 760 c8 -18 16 -18 14 0 s10 -20 18 -8 5 12 12 -1 12 -8 16 3 8 -4 14 -2" fill="none" stroke="#1d2758" strokeWidth="2.2" strokeLinecap="round" />
          <text x="762" y="786" fill="#121318" fillOpacity="0.5" fontSize="11" letterSpacing="1">Founder, Unifesto</text>
        </g>

        </g>

        {/* 4 · Sticker sheet with die-cut stickers, one lifting at the corner. */}
        <g transform="rotate(5 1290 300)">
          <g filter="url(#kit-shadow-md)">
            <rect x="1110" y="132" width="364" height="330" rx="18" fill="#f7f7f5" />
          </g>
          <rect x="1110" y="132" width="364" height="330" rx="18" fill="#000" filter="url(#kit-noise)" opacity="0.25" />
          <g filter="url(#kit-shadow-sm)">
            <circle cx="1196" cy="214" r="58" fill="#fff" />
          </g>
          <circle cx="1196" cy="214" r="50" fill="#121318" />
          <circle cx="1196" cy="214" r="41" fill="none" stroke={LEAD} strokeWidth="2.5" strokeDasharray="2 5" />
          <Mark x={1196} y={217} s={0.95} fill={LEAD} stroke={LEAD} />
          <g filter="url(#kit-shadow-sm)">
            <rect x="1290" y="160" width="112" height="112" rx="30" fill="#fff" />
          </g>
          <rect x="1298" y="168" width="96" height="96" rx="24" fill="#0c0d10" />
          <text x="1346" y="233" textAnchor="middle" fill="#fff" fontSize="60" className="font-display">u</text>
          <path d="M1402 232 L1402 246 Q1402 272 1376 272 L1362 272 Z" fill="#e9e8e4" />
          <path d="M1402 236 L1366 272" stroke="#000" strokeOpacity="0.15" strokeWidth="2" />
          <g filter="url(#kit-shadow-sm)">
            <rect x="1146" y="296" width="292" height="64" rx="32" fill="#fff" />
          </g>
          <rect x="1153" y="303" width="278" height="50" rx="25" fill="url(#kit-holo)" />
          <text x="1292" y="335" textAnchor="middle" fill="#1d2758" fontSize="19" fontWeight="600" letterSpacing="0.5">#UnifestoOrbit</text>
          <g filter="url(#kit-shadow-sm)">
            <circle cx="1176" cy="412" r="36" fill="#fff" />
          </g>
          <circle cx="1176" cy="412" r="29" fill="url(#kit-planet)" />
          <ellipse cx="1176" cy="412" rx="46" ry="12" fill="none" stroke="#1d2758" strokeWidth="4" transform="rotate(-18 1176 412)" />
          <g filter="url(#kit-shadow-sm)">
            <path d="M1268 380 L1279 406 L1305 417 L1279 428 L1268 454 L1257 428 L1231 417 L1257 406 Z" fill="#fff" stroke="#fff" strokeWidth="12" strokeLinejoin="round" />
          </g>
          <path d="M1268 380 L1279 406 L1305 417 L1279 428 L1268 454 L1257 428 L1231 417 L1257 406 Z" fill="url(#kit-gold)" />
          <g filter="url(#kit-shadow-sm)">
            <path d="M1336 384 h104 a22 22 0 0 1 22 22 v8 a22 22 0 0 1 -22 22 h-74 l-18 16 v-16 h-12 a22 22 0 0 1 -22 -22 v-8 a22 22 0 0 1 22 -22z" fill="#fff" />
          </g>
          <path d="M1340 390 h96 a18 18 0 0 1 18 18 v4 a18 18 0 0 1 -18 18 h-72 l-12 10 v-10 h-12 a18 18 0 0 1 -18 -18 v-4 a18 18 0 0 1 18 -18z" fill="#121318" />
          <text x="1388" y="417" textAnchor="middle" fill="#fff" fontSize="16" letterSpacing="0.5">club on.</text>
        </g>

        {/* 5 · The small stuff: enamel pins on a card, phone grip, keychain. */}
        <g transform="rotate(-5 1215 650)">
          <g filter="url(#kit-shadow-md)">
            <rect x="1130" y="516" width="176" height="262" rx="12" fill="#1a1b21" />
          </g>
          <rect x="1130" y="516" width="176" height="262" rx="12" fill="#fff" filter="url(#kit-noise)" opacity="0.5" />
          <rect x="1200" y="530" width="36" height="9" rx="4.5" fill="#0b0c0f" />
          <text x="1218" y="566" textAnchor="middle" fill="rgba(236,235,230,0.55)" fontSize="11" letterSpacing="3">ORBIT PINS</text>
          <g filter="url(#kit-shadow-sm)">
            <circle cx="1180" cy="616" r="25" fill="url(#kit-gold)" />
            <circle cx="1180" cy="616" r="20" fill="url(#kit-planet)" />
            <ellipse cx="1180" cy="616" rx="36" ry="9.5" fill="none" stroke="url(#kit-gold)" strokeWidth="5" transform="rotate(-18 1180 616)" />
          </g>
          <path d="M1170 606 a12 12 0 0 1 10 -6" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.8" />
          <g filter="url(#kit-shadow-sm)">
            <path d="M1258 588 L1266 609 L1287 617 L1266 625 L1258 646 L1250 625 L1229 617 L1250 609 Z" fill="url(#kit-gold)" />
            <path d="M1258 598 L1263 612 L1277 617 L1263 622 L1258 636 L1253 622 L1239 617 L1253 612 Z" fill={LEAD} />
          </g>
          <g filter="url(#kit-shadow-sm)">
            <rect x="1162" y="672" width="112" height="44" rx="22" fill="url(#kit-gold)" />
            <rect x="1166" y="676" width="104" height="36" rx="18" fill="#121318" />
          </g>
          <text x="1218" y="700" textAnchor="middle" fill="#f2d78a" fontSize="15" letterSpacing="1">ship it</text>
          <text x="1218" y="756" textAnchor="middle" fill="rgba(236,235,230,0.35)" fontSize="9" letterSpacing="3">SET OF 3</text>
        </g>

        {lead && (
        <>
        <g filter="url(#kit-shadow-md)">
          <circle cx="1408" cy="566" r="56" fill="#16171c" />
        </g>
        <circle cx="1408" cy="566" r="56" fill="none" stroke="rgba(236,235,230,0.12)" strokeWidth="2" />
        <circle cx="1408" cy="566" r="46" fill="#23252d" />
        <circle cx="1408" cy="566" r="38" fill="none" stroke="rgba(236,235,230,0.08)" strokeWidth="2" />
        <Mark x={1408} y={569} s={0.9} />
        <path d="M1370 540 a46 46 0 0 1 40 -20" stroke="#fff" strokeOpacity="0.18" strokeWidth="4" strokeLinecap="round" fill="none" />

        </>
        )}

        {/* Crew: the keychain moves up into the phone grip's spot. */}
        <g transform={lead ? undefined : "translate(0 -96)"}>
        <g transform="rotate(10 1420 720)">
          <circle cx="1400" cy="650" r="20" fill="none" stroke={FOIL} strokeWidth="5" filter="url(#kit-shadow-sm)" />
          <rect x="1396" y="668" width="8" height="18" rx="3" fill={FOIL} />
          <g filter="url(#kit-shadow-md)">
            <rect x="1348" y="684" width="106" height="104" rx="22" fill="url(#kit-acrylic)" stroke="rgba(201,212,255,0.7)" strokeWidth="2" />
          </g>
          <circle cx="1400" cy="696" r="5" fill="#0f1014" stroke={FOIL} strokeWidth="2" />
          <Mark x={1400} y={738} s={0.85} fill="#e3e9ff" stroke="#e3e9ff" />
          <text x="1400" y="776" textAnchor="middle" fill="#eef1ff" fontSize="12" letterSpacing="4">ORBIT</text>
          <path d="M1360 700 L1376 690" stroke="#fff" strokeOpacity="0.55" strokeWidth="4" strokeLinecap="round" />
        </g>
        </g>

        {/* Markers, matching the numbered list under the image. */}
        {lead ? (
          <>
            <Marker x={186} y={232} n={1} />
            <Marker x={1012} y={150} n={2} />
            <Marker x={742} y={808} n={3} />
            <Marker x={1468} y={150} n={4} />
            <Marker x={1132} y={520} n={5} />
          </>
        ) : (
          <>
            <Marker x={234} y={234} n={1} />
            <Marker x={718} y={630} n={2} />
            <Marker x={1468} y={150} n={3} />
            <Marker x={1132} y={520} n={4} />
          </>
        )}
        </g>
      </svg>
    </div>
  );
}
