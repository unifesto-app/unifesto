import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// No network: the custom-domain lookup is faked. Each test file runs in its own process.
const calls: string[] = [];
globalThis.fetch = (async (url: string) => {
  calls.push(url);
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

test("a custom domain serves only its space (H7)", async () => {
  assert.equal((await run("https://evil.example.com/")).status, 404);
  const root = await run("https://events.acme.edu/");
  assert.equal(root.headers.get("x-middleware-rewrite"), "https://events.acme.edu/space/acme");
  assert.equal(root.headers.get("x-middleware-request-x-tenant-space"), "acme");
  assert.equal((await run("https://events.acme.edu/space/acme")).headers.get("location"), "https://events.acme.edu/");
  const ev = await run("https://events.acme.edu/event/hack-26");
  assert.equal(ev.headers.get("x-middleware-next"), "1");
  assert.equal(ev.headers.get("x-middleware-request-x-tenant-host"), "events.acme.edu");
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

test("only the console's CSP lets in LiveKit, the API socket and Maps", async () => {
  assert.match((await run("https://www.unifesto.app/console", "uf_in=1")).headers.get("content-security-policy") ?? "", /wss:\/\/\*\.livekit\.cloud/);
  assert.doesNotMatch((await run("https://www.unifesto.app/events")).headers.get("content-security-policy") ?? "", /livekit/);
});

test("prerendered pages get a CSP without a nonce; everything else keeps K14's", async () => {
  const csp = async (url: string) => (await run(url)).headers.get("content-security-policy") ?? "";
  for (const path of ["/", "/pricing", "/blog/a-post", "/help/a-guide"]) {
    assert.match(await csp(`https://www.unifesto.app${path}`), /script-src 'self' 'unsafe-inline';/, path);
  }
  for (const path of ["/blog", "/help/contact", "/blog/a-post/opengraph-image", "/event/hack-26", "/login", "/console/present/ev1"]) {
    assert.match(await csp(`https://www.unifesto.app${path}`), /'nonce-[^']+' 'strict-dynamic'/, path);
  }
  // A custom domain's / is its space page, never the cached home page.
  assert.match(await csp("https://events.acme.edu/"), /'nonce-/);
  // A visitor's own CSP header can't put a nonce into a prerendered page's re-render.
  const res = await proxy(new NextRequest("https://www.unifesto.app/pricing", { headers: { "content-security-policy": "script-src 'nonce-x'", "x-nonce": "x" } }));
  assert.equal(res.headers.get("x-middleware-request-content-security-policy"), null);
  assert.equal(res.headers.get("x-middleware-request-x-nonce"), null);
});
