import { forEachPage, inChunks } from './batching';

describe('batching', () => {
  it('forEachPage walks every row by id cursor and stops on a short page', async () => {
    const all = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}` }));
    const fetch = jest.fn(async (p: any) => {
      const start = p.cursor ? all.findIndex((r) => r.id === p.cursor.id) + p.skip : 0;
      return all.slice(start, start + p.take);
    });
    const seen: string[][] = [];
    await forEachPage(fetch, async (rows) => void seen.push(rows.map((r) => r.id)), 2);
    expect(seen).toEqual([['r0', 'r1'], ['r2', 'r3'], ['r4']]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('inChunks never has more than `size` in flight and survives failures', async () => {
    let inFlight = 0;
    let peak = 0;
    const done: number[] = [];
    await inChunks(
      [1, 2, 3, 4, 5],
      async (n) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        if (n === 2) throw new Error('boom');
        done.push(n);
      },
      2,
    );
    expect(peak).toBe(2);
    expect(done).toEqual([1, 3, 4, 5]);
  });
});
