// Not exported from the package root (exports map); string from its dist/constants.
const EVENT_LISTENER_METADATA = 'EVENT_LISTENER_METADATA';
import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { OnEvent } from './on-event';
import { reportError } from './observability';

jest.mock('./observability', () => ({
  ...jest.requireActual('./observability'),
  reportError: jest.fn(),
}));

class Listener {
  @OnEvent('thing.happened', { async: true })
  async onThing(fail: boolean): Promise<string> {
    if (fail) throw new Error('boom');
    return 'ok';
  }
}

describe('OnEvent (Sentry-reporting wrapper)', () => {
  beforeEach(() => jest.mocked(reportError).mockClear());

  it('still registers the Nest listener metadata on the wrapped method', () => {
    const meta = Reflect.getMetadata(
      EVENT_LISTENER_METADATA,
      Listener.prototype.onThing,
    );
    expect(meta).toEqual([
      { event: 'thing.happened', options: { async: true, promisify: true } },
    ]);
  });

  it('hands the result back to emitAsync through a real Nest emitter (UNIFESTO-BACKEND-9)', async () => {
    const mod = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [Listener],
    }).compile();
    await mod.init();
    await expect(mod.get(EventEmitter2).emitAsync('thing.happened', false)).resolves.toEqual(['ok']);
    await mod.close();
  });

  it('passes results through untouched', async () => {
    await expect(new Listener().onThing(false)).resolves.toBe('ok');
    expect(reportError).not.toHaveBeenCalled();
  });

  it('reports a failure with listener + event tags, then rethrows', async () => {
    await expect(new Listener().onThing(true)).rejects.toThrow('boom');
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      listener: 'Listener.onThing',
      event: 'thing.happened',
    });
  });
});
