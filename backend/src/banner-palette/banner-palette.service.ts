import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { isOwnS3Url } from '../storage/own-s3-url';

export interface PaletteColor {
  hex: string;
  /** Share of the banner's pixels in this colour group, 0–100. */
  percent: number;
}

// Downscale first: 64×48 = 3,072 pixels keeps the proportions of a 4:3 banner
// while making the count instant. Frequency survives downscaling well.
const SAMPLE_W = 64;
const SAMPLE_H = 48;
// 4 bits per channel → 16 levels each, 4,096 possible buckets.
const BITS = 4;
// Buckets closer than this (RGB distance) count as one colour, so three shades
// of the same navy become a single "navy 62%" instead of filling all 3 slots.
const MERGE_DISTANCE = 48;
const MAX_BYTES = 10 * 1024 * 1024;
const CACHE_MAX = 500;

const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * Rank an image's colours by how much of it they cover.
 * Returns up to `count` colours, most frequent first.
 */
export async function dominantColors(input: Buffer, count = 3): Promise<PaletteColor[]> {
  const { data, info } = await sharp(input)
    .resize(SAMPLE_W, SAMPLE_H, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 1. Count pixels per quantised bucket, keeping channel sums for a true average.
  const shift = 8 - BITS;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const total = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> shift) << (BITS * 2)) | ((g >> shift) << BITS) | (b >> shift);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.n++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { n: 1, r, g, b });
    }
  }

  // 2. Greedily fold near-identical buckets into clusters, biggest first.
  const clusters: { n: number; r: number; g: number; b: number }[] = [];
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  for (const bk of sorted) {
    const [r, g, b] = [bk.r / bk.n, bk.g / bk.n, bk.b / bk.n];
    const near = clusters.find((c) => {
      const dr = c.r / c.n - r;
      const dg = c.g / c.n - g;
      const db = c.b / c.n - b;
      return Math.sqrt(dr * dr + dg * dg + db * db) < MERGE_DISTANCE;
    });
    if (near) {
      near.n += bk.n;
      near.r += bk.r;
      near.g += bk.g;
      near.b += bk.b;
    } else {
      clusters.push({ ...bk });
    }
  }

  // 3. Most-covering first: 1st, 2nd, 3rd.
  return clusters
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((c) => ({
      hex: toHex(c.r / c.n, c.g / c.n, c.b / c.n),
      percent: Math.round((c.n / total) * 1000) / 10,
    }));
}

@Injectable()
export class BannerPaletteService {
  private readonly logger = new Logger(BannerPaletteService.name);
  /** url → palette. Banners are immutable per URL (re-upload = new key). */
  private readonly cache = new Map<string, PaletteColor[]>();

  async forUrl(url?: string | null): Promise<PaletteColor[]> {
    if (!url) return [];
    const hit = this.cache.get(url);
    if (hit) return hit;

    // Only fetch our own bucket's uploads (J1): any *.amazonaws.com host let a
    // banner URL point the server at someone else's bucket or an EC2 box.
    if (!isOwnS3Url(url)) return [];

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) return [];
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) return [];
      // 8, not 3: clients skip white/black/grey, so keep colours in reserve.
      const colors = await dominantColors(buf, 8);
      if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(url, colors);
      return colors;
    } catch (err) {
      this.logger.warn(`Palette extraction failed for ${url}: ${(err as Error).message}`);
      return [];
    }
  }
}
