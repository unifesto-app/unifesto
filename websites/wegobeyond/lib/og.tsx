import { ImageResponse } from "next/og";

// Share cards (Open Graph + X), drawn like the site: ink ground, DM Sans, rust accent.
export const OG_SIZE = { width: 1200, height: 630 };

const C = { ink: "#0e0c0b", paper: "#e9e5dc", rust: "#cc5a2f", silver: "#a7a6a0" };

// next/og can't use next/font, so it gets DM Sans from Google Fonts: with no browser
// user agent the CSS points at a TTF, and `text` trims it to the glyphs drawn.
async function dmSans(weight: 400 | 700, text: string) {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=DM+Sans:wght@${weight}&text=${encodeURIComponent(text)}`,
    { cache: "force-cache" }
  ).then((r) => r.text());
  const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!url) throw new Error("No DM Sans TTF in the Google Fonts response");
  return fetch(url, { cache: "force-cache" }).then((r) => r.arrayBuffer());
}

// Tight tracking like the site's headlines. A browser also tightens the space after a
// run's last letter; next/og doesn't, so two coloured runs ("wego" + "beyond.") sit one
// tracking unit too far apart. The negative margin takes that unit back.
const tight = (em: number) => ({ letterSpacing: `${em}em`, marginRight: `${em}em` });

type Card = {
  /** Small rust line above the title (an initiative's format), optional. */
  note?: string;
  title: string;
  /** Drawn in rust right after the title, like "beyond." in the wordmark. */
  rust?: string;
  /** One line along the bottom left. */
  foot: string;
  /** Bottom right: the wordmark, or the address on the home card (whose title is the wordmark). */
  corner: "wordmark" | "address";
};

export async function shareCard({ note, title, rust = "", foot, corner }: Card) {
  const bold = `${note ?? ""}${title}${rust}wegobeyond.`;
  const fonts = await Promise.all([dmSans(700, bold), dmSans(400, `${foot}wegobeyond.in`)])
    .then(([b, r]) => [
      { name: "DM Sans", data: b, weight: 700 as const },
      { name: "DM Sans", data: r, weight: 400 as const },
    ])
    // Fonts are a nicety: if Google Fonts is unreachable, next/og's own sans draws it.
    .catch(() => undefined);

  const big = !note; // the home card's single word runs larger than a multi-word name
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "64px 80px 120px",
          backgroundColor: C.ink,
          color: C.paper,
          fontFamily: "DM Sans",
          position: "relative",
        }}
      >
        {note && <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: C.rust }}>{note}</div>}
        <div
          style={{
            display: "flex",
            // The home wordmark stays on one line, as in the hero.
            flexWrap: big ? "nowrap" : "wrap",
            justifyContent: big ? "center" : "flex-start",
            marginTop: note ? 20 : 0,
            fontSize: big ? 150 : title.length > 40 ? 84 : 112,
            fontWeight: 700,
            lineHeight: 0.95,
            maxWidth: 1040,
          }}
        >
          {/* Only a title + rust pair needs the offset between its two runs. */}
          <span style={rust ? tight(-0.05) : { letterSpacing: "-0.05em" }}>{title}</span>
          {rust && <span style={{ color: C.rust, ...tight(-0.05) }}>{rust}</span>}
        </div>
        <div
          style={{
            position: "absolute",
            left: 80,
            right: 80,
            bottom: 64,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 48,
            fontSize: 28,
          }}
        >
          <div style={{ display: "flex", flex: 1, color: C.silver, lineHeight: 1.3 }}>{foot}</div>
          {corner === "wordmark" ? (
            <div style={{ display: "flex", flexShrink: 0, fontWeight: 700 }}>
              <span style={tight(-0.03)}>wego</span>
              <span style={{ color: C.rust, ...tight(-0.03) }}>beyond.</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexShrink: 0, color: C.silver }}>wegobeyond.in</div>
          )}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts }
  );
}
