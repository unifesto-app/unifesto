import { ServiceUnavailableException } from '@nestjs/common';
import { CertificateBatchStatus } from '@prisma/client';
import { CertificatesService } from './certificates.service';
import sharp from 'sharp';
import {
  CertificateRenderService,
  MAX_RENDER_PIXELS,
  MAX_RENDER_SIDE,
  renderScale,
} from './certificate-render.service';

describe('renderScale (S20)', () => {
  it('leaves templates within A4 @ 300 dpi untouched', () => {
    expect(renderScale(2000, 1414)).toBe(1);
    expect(renderScale(3508, 2480)).toBe(1);
  });

  it('caps the 10000 x 10000 worst case to the raster ceiling', () => {
    const s = renderScale(10000, 10000);
    const w = Math.floor(10000 * s);
    expect(w).toBeLessThanOrEqual(MAX_RENDER_SIDE);
    expect(w * w).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
  });

  it('caps a long side even when the area is small', () => {
    expect(Math.floor(10000 * renderScale(10000, 100))).toBe(MAX_RENDER_SIDE);
  });
});

describe('CertificateRenderService.renderAll (S20)', () => {
  it('fetches the background once and caps the PNG to the raster ceiling', async () => {
    const bg = await sharp({
      create: { width: 6000, height: 6000, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    const render = new CertificateRenderService();
    const fetch = jest
      .spyOn(render as any, 'fetchBackground')
      .mockResolvedValue(bg);

    const { pdf, png } = await render.renderAll({
      backgroundUrl: 'https://x/bg.png',
      canvasWidth: 6000,
      canvasHeight: 6000,
      fields: [
        { key: 'recipientName', x: 100, y: 100, fontSize: 120, maxWidth: 5800 },
      ],
      values: { recipientName: 'Ada Lovelace' },
      verifyUrl: 'https://unifesto.app/verify/ABC',
      verifyCode: 'ABC',
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const meta = await sharp(png).metadata();
    expect(meta.width).toBeLessThanOrEqual(MAX_RENDER_SIDE);
    expect(meta.width! * meta.height!).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
  });
});

function setup(queue: { add?: jest.Mock; addReissueRevoked?: jest.Mock }) {
  const prisma = {
    certificate: { count: jest.fn().mockResolvedValue(4) },
    certificateBatch: {
      create: jest.fn().mockResolvedValue({ id: 'b1', status: 'QUEUED' }),
      update: jest.fn(),
    },
    certificateTemplate: {
      findUnique: jest.fn().mockResolvedValue({ id: 't1', eventId: 'e1' }),
    },
  };
  const svc = new CertificatesService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { get: () => undefined } as any,
    {} as any,
    queue as any,
  );
  jest
    .spyOn(svc as any, 'assertCanManage')
    .mockResolvedValue({ id: 'e1', endDateTime: new Date() });
  jest.spyOn(svc as any, 'assertIssuanceWindowOpen').mockReturnValue(undefined);
  return { svc, prisma };
}

describe('certificate work stays off the request path (S20)', () => {
  it('queues "reissue all" instead of rendering in the request', async () => {
    const addReissueRevoked = jest.fn().mockResolvedValue(true);
    const { svc } = setup({ addReissueRevoked });
    const now = jest.spyOn(svc, 'reissueAllRevokedNow');

    const res = await svc.reissueAllRevoked('u1', 'e1');

    expect(addReissueRevoked).toHaveBeenCalledWith('e1', 'u1');
    expect(now).not.toHaveBeenCalled();
    expect(res).toEqual({
      total: 4,
      reissued: 0,
      emailed: 0,
      failed: 0,
      queued: true,
    });
  });

  it('runs inline only when no queue exists (Redis not configured)', async () => {
    const { svc } = setup({
      addReissueRevoked: jest.fn().mockResolvedValue(false),
    });
    const now = jest
      .spyOn(svc, 'reissueAllRevokedNow')
      .mockResolvedValue({} as any);
    await svc.reissueAllRevoked('u1', 'e1');
    expect(now).toHaveBeenCalledWith('u1', 'e1');
  });

  it('fails the batch with a 503 when Redis is down, never rendering inline', async () => {
    const add = jest
      .fn()
      .mockRejectedValue(new ServiceUnavailableException('down'));
    const { svc, prisma } = setup({ add });
    const inline = jest.spyOn(svc, 'processBatch');

    await expect(
      svc.issue('u1', 'e1', { templateId: 't1', audience: 'CONFIRMED' } as any),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(inline).not.toHaveBeenCalled();
    expect(prisma.certificateBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b1' },
        data: expect.objectContaining({
          status: CertificateBatchStatus.FAILED,
        }),
      }),
    );
  });
});
