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

test("the console gate: web's one sign-in, or an old space token until it expires (V8)", async () => {
  // Signed out: web's /login, coming back to the same page.
  assert.equal(
    (await run("https://www.unifesto.app/console/events?space=s1")).headers.get("location"),
    "https://www.unifesto.app/login?next=%2Fconsole%2Fevents%3Fspace%3Ds1",
  );
  for (const open of ["/console/no-access", "/console/present/ev1"]) {
    assert.equal((await run(`https://www.unifesto.app${open}`)).headers.get("x-middleware-next"), "1", open);
  }
  // Web's session hint passes.
  assert.equal((await run("https://www.unifesto.app/console", "uf_in=1")).headers.get("x-middleware-next"), "1");
  // An old space-app token passes while live; expired or malformed ones don't.
  const live = jwt({ userId: "u1", exp: Math.floor(Date.now() / 1000) + 3600 });
  assert.equal((await run("https://www.unifesto.app/console", live)).headers.get("x-middleware-next"), "1");
  assert.match((await run("https://www.unifesto.app/console", jwt({ userId: "u1", exp: 1 }))).headers.get("location") ?? "", /\/login\?next=/);
  assert.match((await run("https://www.unifesto.app/console", "unifesto_token=garbage")).headers.get("location") ?? "", /\/login\?next=/);
});

test("only the console's CSP lets in LiveKit, the API socket and Maps", async () => {
  assert.match((await run("https://www.unifesto.app/console", "uf_in=1")).headers.get("content-security-policy") ?? "", /wss:\/\/\*\.livekit\.cloud/);
  assert.doesNotMatch((await run("https://www.unifesto.app/events")).headers.get("content-security-policy") ?? "", /livekit/);
});
