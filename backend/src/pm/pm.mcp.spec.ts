import { NotFoundException } from '@nestjs/common';
import { PmMcp } from './pm.mcp';

describe('PmMcp', () => {
  const pm = {
    listTasks: jest.fn().mockResolvedValue([{ key: 'P13' }]),
    getTask: jest.fn().mockRejectedValue(new NotFoundException('No task X1')),
    upsertTask: jest.fn().mockResolvedValue({ key: 'P13', status: 'DONE' }),
    addNote: jest.fn(),
    upsertTrack: jest.fn(),
  };
  const mcp = new PmMcp(pm as any);
  const call = (method: string, params?: any) =>
    mcp.handle(
      { jsonrpc: '2.0', id: 1, method, params },
      'Claude (laptop)',
    ) as Promise<any>;

  it('negotiates protocol version and lists tools', async () => {
    const init = await call('initialize', { protocolVersion: '2025-03-26' });
    expect(init.result.protocolVersion).toBe('2025-03-26');
    expect(
      (await call('initialize', { protocolVersion: '1999' })).result
        .protocolVersion,
    ).toBe('2025-06-18');
    const names = (await call('tools/list')).result.tools.map(
      (t: any) => t.name,
    );
    expect(names).toEqual([
      'list_tasks',
      'get_task',
      'upsert_task',
      'add_note',
      'upsert_track',
    ]);
  });

  it('ignores notifications', async () => {
    expect(
      await mcp.handle(
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        'x',
      ),
    ).toBeNull();
  });

  it('passes the actor through and validates status', async () => {
    const ok = await call('tools/call', {
      name: 'upsert_task',
      arguments: { key: 'P13', status: 'DONE' },
    });
    expect(ok.result.isError).toBeUndefined();
    expect(pm.upsertTask).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'P13', status: 'DONE' }),
      'Claude (laptop)',
    );

    const bad = await call('tools/call', {
      name: 'upsert_task',
      arguments: { key: 'P13', status: 'FINISHED' },
    });
    expect(bad.result.isError).toBe(true);
  });

  it('returns tool failures as content, unknown methods as errors', async () => {
    const missing = await call('tools/call', {
      name: 'get_task',
      arguments: { key: 'X1' },
    });
    expect(missing.result).toEqual({
      content: [{ type: 'text', text: 'No task X1' }],
      isError: true,
    });
    expect((await call('resources/list')).error.code).toBe(-32601);
  });
});

describe('cleanLabels', () => {
  it('trims, lowercases and de-duplicates', () => {
    const { cleanLabels } = require('./pm.service');
    expect(cleanLabels([' Mobile', 'mobile', '', 'Launch '])).toEqual([
      'mobile',
      'launch',
    ]);
  });
});
