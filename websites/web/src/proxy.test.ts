import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { SITE } from "@/lib/site";

// No network: the custom-domain and event lookups are faked. Each test file runs in its own process.
const calls: string[] = [];
const events: Record<string, string> = { "hack-26": "acme", "other-fest": "other" };
globalThis.fetch = (async (url: string) => {
  calls.push(url);
  const event = events[url.split("/events/")[1]];
  if (event) return new Response(JSON.stringify({ space: { slug: event } }), { status: 200 });
  return url.includes("host=events.acme.edu")
    ? new Response(JSON.stringify({ spaceSlug: "acme" }), { status: 200 })
    : new Response("{}", { status: 404 });
}) as typeof fetch;

const { proxy } = await import("@/proxy");
const run = (url: string, cookie?: string) => proxy(new NextRequest(url, cookie ? { headers: { cookie } } : undefined));

test("own hosts pass, the bare domain goes to www", async () => {
  assert.equal((await run("https://www.unifesto.app/events")).headers.get("x-middleware-next"), "1");
  assert.equal((await run("https://unifesto.app/x")).headers.get("location"), "https://www.unifesto.app/x");
});

test("an iPhone app link the app didn't catch goes to the App Store", async () => {
  const iphone = { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15" };
  const at = async (url: string, headers?: Record<string, string>) => (await proxy(new NextRequest(url, { headers }))).headers;
  for (const url of ["https://www.unifesto.app/event/x?utm_source=wa&app=1", "https://unifesto.app/event/x?app=1"]) {
    assert.equal((await at(url, iphone)).get("location"), SITE.appStore, url);
  }
  // The same link copied to another device: its page, without the marker.
  assert.equal((await at("https://www.unifesto.app/event/x?utm_source=wa&app=1")).get("location"), "https://www.unifesto.app/event/x?utm_source=wa");
  assert.equal((await at("https://www.unifesto.app/space/acme?app=1")).get("location"), "https://www.unifesto.app/space/acme");
  assert.equal((await at("https://www.unifesto.app/event/x?app=0", iphone)).get("x-middleware-next"), "1");
  // App links still read the AASA.
  assert.equal((await at("https://www.unifesto.app/.well-known/apple-app-site-association?app=1", iphone)).get("x-middleware-next"), "1");
});

test("a custom domain serves only its space (H7)", async () => {
  assert.equal((await run("https://evil.example.com/")).status, 404);
  const root = await run("https://events.acme.edu/");
  assert.equal(root.headers.get("x-middleware-rewrite"), "https://events.acme.edu/space/acme");
  assert.equal(root.headers.get("x-middleware-request-x-tenant-space"), "acme");
  assert.equal((await run("https://events.acme.edu/space/acme")).headers.get("location"), "https://events.acme.edu/");
  const ev = await run("https://events.acme.edu/event/hack-26");
  assert.equal(ev.headers.get("x-middleware-next"), "1");
  assert.equal(ev.headers.get("x-middleware-request-x-tenant-host"), "events.acme.edu");
  // Another space's event: 404 here, since the cached page can't see the host (J25).
  assert.equal((await run("https://events.acme.edu/event/other-fest")).status, 404);
  assert.equal((await run("https://events.acme.edu/event/other-fest/register")).status, 404);
  assert.equal((await run("https://www.unifesto.app/event/other-fest")).headers.get("x-middleware-next"), "1");
  // Looked up once, then remembered.
  await run("https://events.acme.edu/event/other-fest");
  assert.equal(calls.filter((c) => c.endsWith("/events/other-fest")).length, 1);
  assert.equal((await run("https://events.acme.edu/space/other")).headers.get("location"), "https://www.unifesto.app/space/other");
  assert.equal((await run("https://events.acme.edu/privacy?a=1")).headers.get("location"), "https://www.unifesto.app/privacy?a=1");
  // Its /console is the main site's.
  assert.equal((await run("https://events.acme.edu/console/events")).headers.get("location"), "https://www.unifesto.app/console/events");
  // Resolved once, then cached.
  assert.equal(calls.filter((c) => c.includes("events.acme.edu")).length, 1);
});

const jwt = (p: object) => `unifesto_token=e30.${Buffer.from(JSON.stringify(p)).toString("base64url")}.x`;

test("the console gate: web's one sign-in only (V8)", async () => {
  // Signed out: web's /login, coming back to the same page.
  assert.equal(
    (await run("https://www.unifesto.app/console/events?space=s1")).headers.get("location"),
    "https://www.unifesto.app/login?next=%2Fconsole%2Fevents%3Fspace%3Ds1",
  );
  // The projector signs in with its display link.
  assert.equal((await run("https://www.unifesto.app/console/present/ev1")).headers.get("x-middleware-next"), "1");
  // Web's session hint passes.
  assert.equal((await run("https://www.unifesto.app/console", "uf_in=1")).headers.get("x-middleware-next"), "1");
  // The old space-app cookie no longer gets in, live or not (V4).
  const live = jwt({ userId: "u1", exp: Math.floor(Date.now() / 1000) + 3600 });
  assert.match((await run("https://www.unifesto.app/console", live)).headers.get("location") ?? "", /\/login\?next=/);
  assert.match((await run("https://www.unifesto.app/console", "unifesto_token=garbage")).headers.get("location") ?? "", /\/login\?next=/);
});

test("only the console's CSP lets in Maps", async () => {
  assert.match((await run("https://www.unifesto.app/console", "uf_in=1")).headers.get("content-security-policy") ?? "", /https:\/\/\*\.googleapis\.com/);
  assert.doesNotMatch((await run("https://www.unifesto.app/events")).headers.get("content-security-policy") ?? "", /https:\/\/\*\.googleapis\.com/);
});

test("prerendered pages get a CSP without a nonce; everything else keeps K14's", async () => {
  const csp = async (url: string) => (await run(url)).headers.get("content-security-policy") ?? "";
  for (const path of ["/", "/pricing", "/blog", "/blog/a-post", "/events", "/help/a-guide", "/event/hack-26"]) {
    assert.match(await csp(`https://www.unifesto.app${path}`), /script-src 'self' 'unsafe-inline';/, path);
  }
  for (const path of ["/help/contact", "/event/hack-26/register", "/blog/a-post/opengraph-image", "/login", "/console/present/ev1"]) {
    assert.match(await csp(`https://www.unifesto.app${path}`), /'nonce-[^']+' 'strict-dynamic'/, path);
  }
  // A custom domain's / is its space page, never the cached home page.
  assert.match(await csp("https://events.acme.edu/"), /'nonce-/);
  // Its event page is the same prerendered page as www's.
  assert.match(await csp("https://events.acme.edu/event/hack-26"), /script-src 'self' 'unsafe-inline';/);
  assert.match(await csp("https://events.acme.edu/event/hack-26/register"), /'nonce-/);
  // A visitor's own CSP header can't put a nonce into a prerendered page's re-render.
  const res = await proxy(new NextRequest("https://www.unifesto.app/pricing", { headers: { "content-security-policy": "script-src 'nonce-x'", "x-nonce": "x" } }));
  assert.equal(res.headers.get("x-middleware-request-content-security-policy"), null);
  assert.equal(res.headers.get("x-middleware-request-x-nonce"), null);
});

test("only the event card may sit in another site's frame (K21)", async () => {
  const ancestors = async (path: string) =>
    /frame-ancestors ([^;]+)/.exec((await run(`https://www.unifesto.app${path}`)).headers.get("content-security-policy") ?? "")?.[1];
  assert.equal(await ancestors("/embed/event/hack-26"), "*");
  for (const path of ["/", "/embed", "/embed/", "/embed/nope", "/embed/event", "/embed/event/a/b", "/embedx/event/a", "/event/hack-26", "/login"]) {
    assert.equal(await ancestors(path), "'none'", path);
  }
});
