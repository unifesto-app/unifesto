/**
 * Query-string page/limit → safe numbers. Garbage (`?page=abc`, `0`, `-3`)
 * falls back to the default instead of reaching Prisma as NaN (a 500), and
 * `limit` is capped so no caller can ask for the whole table. 500 is the most
 * any operator screen asks for today; public endpoints pass a tighter max.
 */
export function toPage(v: unknown): number {
  const n = Math.trunc(Number(v));
  return n >= 1 ? n : 1;
}

export function toLimit(v: unknown, def = 20, max = 500): number {
  const n = Math.trunc(Number(v));
  return n >= 1 ? Math.min(n, max) : def;
}
