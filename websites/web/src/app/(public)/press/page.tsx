import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { ArrowRight, DownloadSimple } from "@unifesto/unicon/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/site/PageHero";
import Section from "@/components/site/Section";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import { BRAND_KIT, PROOF, RELEASES, SITE } from "@/lib/site";

export const metadata: Metadata = withSocial({
  title: "Press & Releases",
  description:
    "News from Unifesto, company facts, and the Unifesto brand kit: logo, app icon, favicon and brand guidelines to download.",
  alternates: { canonical: "/press" },
}, { title: "Unifesto Press & Releases", description: "News, company facts and the Unifesto brand kit." });

/* Each tile shows the asset on the ground it was made for, so the preview
   colours are fixed (not theme tokens): silver lives on black, ink on white. */
const ASSETS = [
  {
    title: "Wordmark, on dark",
    note: "The primary logo",
    preview: "/press/wordmark-silver.svg",
    ground: "bg-[#000]",
    imgClass: "w-[68%]",
    files: [{ label: "SVG", href: "/press/wordmark-silver.svg" }],
  },
  {
    title: "Wordmark, on light",
    note: "Ink #111113",
    preview: "/press/wordmark-ink.svg",
    ground: "bg-[#fff]",
    imgClass: "w-[68%]",
    files: [{ label: "SVG", href: "/press/wordmark-ink.svg" }],
  },
  {
    title: "App icon",
    note: "iOS and Android",
    preview: "/press/app-icon-dark-rounded-1024.png",
    ground: "bg-[#000]",
    imgClass: "w-[42%]",
    files: [
      { label: "PNG", href: "/press/app-icon-dark-1024.png" },
      { label: "Rounded", href: "/press/app-icon-dark-rounded-1024.png" },
    ],
  },
  {
    title: "Symbol",
    note: "The u, for small spaces",
    preview: "/press/symbol-silver.svg",
    ground: "bg-[#000]",
    imgClass: "w-[34%]",
    files: [
      { label: "Silver", href: "/press/symbol-silver.svg" },
      { label: "Ink", href: "/press/symbol-ink.svg" },
    ],
  },
] as const;

/* Product lockups: the wordmark plus the product name, silver on black. */
const PRODUCTS = ["Stay", "Huddle", "Sprint", "Orbit"] as const;

/* "Powered by" badges for organisers. Grounds show where each one belongs. */
const BADGES = [
  { theme: "dark", label: "Dark badge", ground: "bg-[#1c1c1f]" },
  { theme: "light", label: "Light badge", ground: "bg-[#ececee]" },
  { theme: "white", label: "White, on dark colours", ground: "bg-[#3c5a8c]" },
  { theme: "black", label: "Black, on light colours", ground: "bg-[#f8d478]" },
] as const;

const BADGE_LAYOUTS = [
  { title: "Side by side", suffix: "", width: "78%" },
  { title: "Stacked: Powered by on top, unifesto below", suffix: "-stacked", width: "52%" },
] as const;

/* Paste-in snippet: links back with UTM so badge traffic shows up in analytics. */
const BADGE_SNIPPET = `<a href="https://www.unifesto.app/?utm_source=powered_by&utm_medium=badge" target="_blank" rel="noopener">
  <img src="https://www.unifesto.app/press/powered-by-dark.svg" alt="Powered by Unifesto" height="40">
</a>`;

const FACTS = [
  ["Company", SITE.legalName],
  ["Based in", "Hyderabad, India"],
  ["First campus", PROOF.firstCampus],
  ["People checked in", PROOF.attendees],
  ["Events run", PROOF.events],
  ["Spaces live", String(PROOF.spacesLive)],
  ["Apps", "iOS and Android, free"],
  ["Website", "www.unifesto.app"],
] as const;

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export default function PressPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Press & Releases", path: "/press" }])} />
      <Navbar />

      <PageHero
        lines={["Press & Releases", "News, facts and the brand kit."]}
        accentFrom={1}
        size="md"
        lede="Writing about Unifesto? Everything you need is here: what we have shipped, the numbers as of today, and our logo and icons in every format."
        actions={
          <>
            <a href={BRAND_KIT.zip} download className="btn btn-lg btn-primary">
              Download brand kit
              <DownloadSimple className="h-3.5 w-3.5" weight="bold" aria-hidden="true" />
            </a>
            <a href={`mailto:${SITE.email}?subject=Press%20enquiry`} className="btn btn-lg btn-secondary">
              Contact press
            </a>
          </>
        }
      />

      {/* ── Brand kit ─────────────────────────────────────────────── */}
      <Section surface="paper" aria-labelledby="kit-heading">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 id="kit-heading" data-reveal="clip" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.15] text-ink">
              Brand kit
            </h2>
            <p className="mt-4 max-w-[56ch] text-[15px] font-light leading-relaxed text-ink/70">
              Logo, symbol, product lockups, app icon and favicon in SVG and PNG, with the guidelines. Please use the files as they are: no
              recolouring, stretching or retyping.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={BRAND_KIT.zip} download className="btn btn-primary">
              Full kit (.zip)
              <DownloadSimple className="h-3.5 w-3.5" weight="bold" aria-hidden="true" />
            </a>
            <a href={BRAND_KIT.guidelines} target="_blank" rel="noopener" className="btn btn-secondary">
              Guidelines (PDF)
            </a>
          </div>
        </div>

        <ul data-stagger="rise" className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ASSETS.map((a) => (
            <li key={a.title} className="flex flex-col overflow-hidden rounded-2xl shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.1)]">
              <div className={`grid aspect-[4/3] place-items-center ${a.ground}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.preview} alt={`Unifesto ${a.title.toLowerCase()}`} className={a.imgClass} loading="lazy" />
              </div>
              <div className="flex flex-1 items-end justify-between gap-3 p-5">
                <div>
                  <h3 className="text-[15px] text-ink">{a.title}</h3>
                  <p className="mt-1 text-[13px] text-ink/55">{a.note}</p>
                </div>
                <div className="flex shrink-0 gap-3">
                  {a.files.map((f) => (
                    <a key={f.href} href={f.href} download className="link-draw text-[13px] text-ink">
                      {f.label}
                    </a>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div id="products" className="mt-20 scroll-mt-28">
          <h3 className="text-xl text-ink">Products</h3>
          <p className="mt-3 max-w-[60ch] text-[15px] font-light leading-relaxed text-ink/70">
            Unifesto Stay, Unifesto Huddle, Unifesto Sprint and Unifesto Orbit. Silver on dark, ink on light, same rules as the logo.
          </p>
          <ul data-stagger="rise" className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {PRODUCTS.map((p) => {
              const file = `/press/lockup-${p.toLowerCase()}`;
              return (
                <li key={p} className="flex flex-col overflow-hidden rounded-2xl shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.1)]">
                  <div className="grid aspect-[16/9] place-items-center bg-[#000]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${file}-silver.svg`} alt={`Unifesto ${p} logo`} className="w-[78%]" loading="lazy" />
                  </div>
                  <div className="flex items-end justify-between gap-3 p-5">
                    <span className="text-[14px] text-ink">Unifesto {p}</span>
                    <div className="flex shrink-0 gap-3">
                      <a href={`${file}-silver.svg`} download className="link-draw text-[13px] text-ink">Silver</a>
                      <a href={`${file}-ink.svg`} download className="link-draw text-[13px] text-ink">Ink</a>
                      <a href={`${file}-silver.png`} download className="link-draw text-[13px] text-ink">PNG</a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div id="powered-by" className="mt-20 scroll-mt-28">
          <h3 className="text-xl text-ink">Powered by Unifesto</h3>
          <p className="mt-3 max-w-[60ch] text-[15px] font-light leading-relaxed text-ink/70">
            Running your event on Unifesto? Add the badge to your event page, posters, standees or sponsor wall. Boxed
            badges work on photos; one-colour ones sit on a plain colour. Use the stacked layout for square spaces.
          </p>
          {BADGE_LAYOUTS.map((layout) => (
            <div key={layout.title} className="mt-10">
              <h4 className="text-[13px] text-ink/55">{layout.title}</h4>
              <ul data-stagger="rise" className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {BADGES.map((b) => {
                  const file = `/press/powered-by-${b.theme}${layout.suffix}`;
                  return (
                    <li key={b.theme} className="flex flex-col overflow-hidden rounded-2xl shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.1)]">
                      <div className={`grid aspect-[16/9] place-items-center ${b.ground}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${file}.svg`} alt={`Powered by Unifesto, ${layout.title.toLowerCase()}, ${b.label.toLowerCase()}`} style={{ width: layout.width }} loading="lazy" />
                      </div>
                      <div className="flex items-end justify-between gap-3 p-5">
                        <span className="text-[14px] text-ink">{b.label}</span>
                        <div className="flex shrink-0 gap-3">
                          <a href={`${file}.svg`} download className="link-draw text-[13px] text-ink">SVG</a>
                          <a href={`${file}.png`} download className="link-draw text-[13px] text-ink">PNG</a>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p className="mt-8 text-[13px] text-ink/55">For your website, paste this where the badge should appear:</p>
          <pre className="mt-3 overflow-x-auto rounded-2xl p-5 font-mono text-[12px] leading-relaxed text-ink/85 shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.12)]">
            <code>{BADGE_SNIPPET}</code>
          </pre>
        </div>
      </Section>

      {/* ── Releases ──────────────────────────────────────────────── */}
      <Section aria-labelledby="releases-heading" width="mid">
        <h2 id="releases-heading" data-reveal="clip" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.15] text-paper">
          Releases
        </h2>
        <ol data-stagger="rise" className="mt-12">
          {RELEASES.map((r) => (
            <li key={r.date + r.title} className="grid gap-3 py-8 border-t border-border md:grid-cols-[12rem_1fr] md:gap-10">
              <time dateTime={r.date} className="text-sm text-paper/55">
                {fmtDate(r.date)}
              </time>
              <div>
                <h3 className="text-lg text-paper">{r.title}</h3>
                <p className="mt-2 max-w-[60ch] text-[15px] font-light leading-relaxed text-paper/65">{r.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Facts + boilerplate ───────────────────────────────────── */}
      <Section surface="paper" aria-labelledby="facts-heading">
        <div className="grid gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <div>
            <h2 id="facts-heading" data-reveal="clip" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.15] text-ink">
              Fast facts
            </h2>
            <dl data-stagger="rise" className="mt-10">
              {FACTS.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[10rem_1fr] gap-6 py-4 border-t border-border">
                  <dt className="text-[15px] text-ink/55">{k}</dt>
                  <dd className="text-[15px] text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[13px] text-ink/45">Numbers as of {PROOF.asOf}.</p>
          </div>
          <div>
            <h3 className="text-lg text-ink">About Unifesto</h3>
            <p className="mt-2 text-[13px] text-ink/55">Boilerplate, free to use as written.</p>
            <blockquote className="mt-6 rounded-2xl p-7 text-[15px] leading-relaxed text-ink shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.12)]">
              {SITE.description}
            </blockquote>
            <h3 className="mt-12 text-lg text-ink">Press contact</h3>
            <p className="mt-3 text-[15px] font-light leading-relaxed text-ink/70">
              For interviews, data or product access, write to us.
            </p>
            <a href={`mailto:${SITE.email}?subject=Press%20enquiry`} className="link-draw mt-4 inline-flex items-center gap-2 text-[15px] text-ink">
              {SITE.email} <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </Section>

      <Footer />
    </main>
  );
}
