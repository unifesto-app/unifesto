#!/bin/sh
# Assemble the press brand kit and publish it to the website. Run after build.py + render.py.
set -e
cd "$(dirname "$0")"
K=dist/Unifesto-Brand-Kit
rm -rf dist && mkdir -p "$K/Logo/SVG" "$K/Logo/PNG" "$K/Symbol/SVG" "$K/Symbol/PNG" "$K/App icon" "$K/Favicon" "$K/Social" "$K/Powered by/SVG" "$K/Powered by/PNG" "$K/Products/SVG" "$K/Products/PNG" "$K/Usage"
cp Unifesto-Brand-Guidelines.pdf "$K/"
for c in silver ink white black; do
  cp "svg/wordmark-$c.svg" "$K/Logo/SVG/unifesto-wordmark-$c.svg"
  cp "png/wordmark-$c-2400.png" "$K/Logo/PNG/unifesto-wordmark-$c.png"
  cp "svg/symbol-$c.svg" "$K/Symbol/SVG/unifesto-symbol-$c.svg"
  cp "png/symbol-$c-1024.png" "$K/Symbol/PNG/unifesto-symbol-$c.png"
done
cp png/app-icon-dark-1024.png png/app-icon-light-1024.png png/app-icon-dark-rounded-1024.png png/app-icon-light-rounded-1024.png "$K/App icon/"
cp svg/favicon.svg favicon.ico png/favicon-512.png png/favicon-32.png png/favicon-16.png "$K/Favicon/"
for t in dark light white black; do for v in "" -stacked; do
  cp "svg/powered-by-$t$v.svg" "$K/Powered by/SVG/unifesto-powered-by-$t$v.svg"
  cp "png/powered-by-$t$v.png" "$K/Powered by/PNG/unifesto-powered-by-$t$v.png"
done; done
for p in stay huddle sprint; do for c in silver ink white black; do
  cp "svg/lockup-$p-$c.svg" "$K/Products/SVG/unifesto-$p-$c.svg"
  cp "png/lockup-$p-$c.png" "$K/Products/PNG/unifesto-$p-$c.png"
done; done
for p in huddle sprint; do for l in header signoff light; do
  cp "png/poster-$p-$l.png" "$K/Usage/unifesto-$p-poster-$l.png"
done; done
for k in photo colour light stacked; do cp "png/poster-powered-by-$k.png" "$K/Usage/unifesto-powered-by-poster-$k.png"; done
cp png/social-avatar-1080.png "$K/Social/unifesto-profile-picture.png"
cat > "$K/README.txt" <<'TXT'
Unifesto brand kit · October 2026

Logo/      The wordmark. Silver on dark backgrounds, ink on light. White/black for one-colour use.
Symbol/    The "u" on its own, for avatars and small spaces.
App icon/  The app icon, square (stores apply their own mask) and rounded (for slides and mockups).
Favicon/   Browser and small-size icon.
Social/    Profile picture for social accounts.
Products/  Unifesto Stay, Unifesto Huddle and Unifesto Sprint lockups. Same colour rules as the logo.
Usage/     Sample posters: Huddle on session posters, Sprint on hackathon posters (masthead, sign-off, light),
           and organiser posters carrying the Powered by badge.
Powered by/  Badges for events run on Unifesto: boxed dark/light, one-colour white/black, horizontal and stacked.

Read Unifesto-Brand-Guidelines.pdf before use. Please don't recolour, stretch or retype the logo.
Questions: support@unifesto.app · www.unifesto.app/press
TXT
(cd dist && zip -qr -X Unifesto-Brand-Kit.zip Unifesto-Brand-Kit)
P=../../websites/web/public/press
mkdir -p "$P"
cp dist/Unifesto-Brand-Kit.zip Unifesto-Brand-Guidelines.pdf "$P/"
cp svg/wordmark-silver.svg svg/wordmark-ink.svg svg/symbol-silver.svg svg/symbol-ink.svg png/app-icon-dark-rounded-1024.png png/app-icon-dark-1024.png "$P/"
for p in stay huddle sprint; do cp "svg/lockup-$p-silver.svg" "svg/lockup-$p-ink.svg" "png/lockup-$p-silver.png" "png/lockup-$p-ink.png" "$P/"; done
for p in huddle sprint; do for l in header signoff light; do cp "png/poster-$p-$l.png" "$P/"; done; done
for k in photo colour light stacked; do cp "png/poster-powered-by-$k.png" "$P/"; done
for t in dark light white black; do cp "svg/powered-by-$t.svg" "svg/powered-by-$t-stacked.svg" "png/powered-by-$t.png" "png/powered-by-$t-stacked.png" "$P/"; done
ls -la "$P"
