import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BUTTON, cardIframeHtml, popupButtonHtml, registerButtonHtml } from "@/console/lib/register-button";

const href = "https://www.unifesto.app/event/x/register?utm_source=site&return=https%3A%2F%2Fa.in";

test("the default button is Horizon ink with the link's & escaped", () => {
  const html = registerButtonHtml(href);
  assert.match(html, /^<a href="https:\/\/www\.unifesto\.app\/event\/x\/register\?utm_source=site&amp;return=https%3A%2F%2Fa\.in" style="/);
  assert.match(html, /background:#111113;color:#ffffff/);
  assert.match(html, />Register on Unifesto<\/a>$/);
});

test("organiser text can't break out of the tag", () => {
  const html = registerButtonHtml(href, { ...DEFAULT_BUTTON, label: `<img src=x onerror=alert(1)>" onclick="x` });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.equal(html.match(/"/g)?.length, 4); // only href="…" and style="…"
});

test("colours are hex only and the shape falls back to a pill", () => {
  const html = registerButtonHtml(href, {
    label: "Register now",
    background: "red;position:fixed",
    color: "#ABCDEF",
    shape: "blob" as never,
  });
  assert.match(html, /background:#111113;color:#ABCDEF/);
  assert.match(html, /border-radius:999px/);
  assert.ok(!html.includes("position"));
  assert.match(html, />Register now<\/a>$/);
});

test("a blank label falls back to the default", () => {
  assert.match(registerButtonHtml(href, { ...DEFAULT_BUTTON, label: "   " }), />Register on Unifesto<\/a>$/);
});

test("the popup button loads embed.js and marks the link for it", () => {
  const html = popupButtonHtml("https://www.unifesto.app", href);
  assert.match(html, /^<script src="https:\/\/www\.unifesto\.app\/embed\.js" async><\/script>\n<a href="[^"]+" data-unifesto-event style="/);
});

test("the card iframe is tagged with the site and its title escaped", () => {
  const html = cardIframeHtml("https://www.unifesto.app", "build-sunday", "wegobeyond", "dark", `Build "Sunday" <x>`);
  assert.match(html, /src="https:\/\/www\.unifesto\.app\/embed\/event\/build-sunday\?source=wegobeyond&amp;theme=dark"/);
  assert.match(html, /title="Build &quot;Sunday&quot; <x>"/);
});
