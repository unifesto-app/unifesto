import { NotFoundException } from '@nestjs/common';
import { PublicConfigController } from './public-config.controller';

/** GET /config/processing-fee: an event's own terms with ?eventId, else the rate card. */
describe('processing fee terms', () => {
  const platformConfig = { getProcessingFeePercent: () => 4, getProcessingFeeCapPerTicket: () => 99 };
  const build = (forEvent: (id: string) => Promise<unknown>) =>
    new PublicConfigController(platformConfig as any, {} as any, { forEvent } as any);

  it('without an event: the rate card, as older apps read it', async () => {
    const ctrl = build(async () => {
      throw new Error('not called');
    });
    expect(await ctrl.getProcessingFee()).toEqual({ processingFeePercent: 4, processingFeeCapPerTicket: 99 });
  });

  it("with an event: its space's terms, a deal or a capless one-fee plan included", async () => {
    const ctrl = build(async () => ({ buyerFeeBps: 700, buyerFeeCapPaise: null }));
    expect(await ctrl.getProcessingFee('e')).toEqual({ processingFeePercent: 7, processingFeeCapPerTicket: null });
    const capped = build(async () => ({ buyerFeeBps: 350, buyerFeeCapPaise: 9_900 }));
    expect(await capped.getProcessingFee('e')).toEqual({ processingFeePercent: 3.5, processingFeeCapPerTicket: 99 });
  });

  it('an unknown event is a 404', async () => {
    const ctrl = build(async () => {
      throw new NotFoundException('Event not found');
    });
    await expect(ctrl.getProcessingFee('e')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a database failure stays a 500, not a 404', async () => {
    const ctrl = build(async () => {
      throw new Error("Can't reach database server");
    });
    await expect(ctrl.getProcessingFee('e')).rejects.not.toBeInstanceOf(NotFoundException);
  });
});
