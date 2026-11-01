import type Anthropic from '@anthropic-ai/sdk';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export const MAX_AI_IMAGE_BYTES = 5 * 1024 * 1024;
/** An image costs about w×h/750 tokens, so a 1092 px box keeps one under ~1.6k. */
const MAX_EDGE = 1092;
const FORMATS = new Set(['jpeg', 'png', 'webp']);

/**
 * AI10 image input (AI2 poster draft): JPEG, PNG or WebP by content, not by
 * name, 5 MB at most, turned upright and shrunk to fit 1092 px, then sent as
 * a JPEG. Anything else is a 400 the curator can act on.
 */
export async function aiImage(file: Buffer): Promise<Anthropic.ImageBlockParam> {
  if (file.length > MAX_AI_IMAGE_BYTES) throw new BadRequestException('Images can be 5 MB at most');
  const format = await sharp(file)
    .metadata()
    .then((m) => m.format)
    .catch(() => undefined);
  if (!format || !FORMATS.has(format)) throw new BadRequestException('Use a JPEG, PNG or WebP image');
  const jpeg = await sharp(file)
    .rotate()
    .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } };
}
