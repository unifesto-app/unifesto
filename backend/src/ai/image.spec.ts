import sharp from 'sharp';
import { aiImage, MAX_AI_IMAGE_BYTES } from './image';

describe('aiImage', () => {
  it('shrinks a poster to fit 1092 px and sends it as a JPEG', async () => {
    const png = await sharp({ create: { width: 3000, height: 2000, channels: 4, background: '#f00' } }).png().toBuffer();
    const block = await aiImage(png);
    expect(block.source).toMatchObject({ type: 'base64', media_type: 'image/jpeg' });
    const meta = await sharp(Buffer.from((block.source as { data: string }).data, 'base64')).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1092, 728]);
  });

  it('refuses other formats, non-images and anything over 5 MB', async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();
    await expect(aiImage(gif)).rejects.toThrow('Use a JPEG, PNG or WebP image');
    await expect(aiImage(Buffer.from('<svg/> not really'))).rejects.toThrow('Use a JPEG, PNG or WebP image');
    await expect(aiImage(Buffer.alloc(MAX_AI_IMAGE_BYTES + 1))).rejects.toThrow('5 MB');
  });
});
