/* Route a remote (S3) image through Next's optimizer: resized to `w` and
   served as WebP. Used where images are CSS backgrounds, which <Image> can't
   cover. `w` must be one of Next's image widths (128, 640, 750, 828, 1080, ...). */
export const optimized = (url: string, w: 128 | 640 | 750 | 828 | 1080 = 1080) =>
  /^https?:\/\//.test(url) ? `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75` : url;
