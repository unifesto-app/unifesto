import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

/**
 * Multer options for a single-file upload capped at `maxMb`. Multer buffers
 * uploads into memory, so without this a request is read in full before any
 * ParseFilePipe / service size check runs — an oversized body can push the
 * container toward OOM. Pass as `FileInterceptor(field, uploadLimit(n))`.
 * Keep `maxMb` ≥ any later validator so its friendlier message still wins.
 */
export function uploadLimit(maxMb: number): MulterOptions {
  return { limits: { fileSize: maxMb * 1024 * 1024, files: 1 } };
}
