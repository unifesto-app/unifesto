import { AiRunOutcome } from '@prisma/client';
import { AiService, aiCostUsd } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformConfigService } from '../subscription/platform-config.service';

/**
 * D12 AI foundation: every path that isn't a clean answer comes back as
 * `{ ok: false }` (human fallback) instead of throwing, and every call that
 * reached the API is logged.
 */
describe('AiService', () => {
  const usage = {
    input_tokens: 1000,
    output_tokens: 200,
    cache_read_input_tokens: 4000,
    cache_creation_input_tokens: 0,
  };

  function setup(opts: { enabled?: boolean; used?: number } = {}) {
    const prisma = {
      aiRun: {
        count: jest.fn().mockResolvedValue(opts.used ?? 0),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const platformConfig = {
      isAiFeatureEnabled: jest.fn().mockResolvedValue(opts.enabled ?? true),
    };
    const create = jest.fn();
    const svc = new AiService(
      prisma as unknown as PrismaService,
      platformConfig as unknown as PlatformConfigService,
    );
    (svc as unknown as { client: unknown }).client = { messages: { create } };
    /** The AiRun row the service tried to write. */
    const logged = () =>
      (
        prisma.aiRun.create.mock.calls[0] as [{ data: Record<string, unknown> }]
      )[0].data;
    return { svc, prisma, create, logged };
  }

  const input = {
    system: 'You triage support cases.',
    messages: [{ role: 'user' as const, content: 'My ticket is missing' }],
    userId: 'u1',
    subject: 'case:1',
  };

  it('answers, caches the system prompt, clamps max_tokens and logs cost', async () => {
    const { svc, create, logged } = setup();
    create.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: ' billing ' }],
      usage,
    });

    await expect(
      svc.run('triage', { ...input, maxTokens: 99_999 }),
    ).resolves.toEqual({
      ok: true,
      text: 'billing',
    });
    const [req] = create.mock.calls[0] as [
      {
        model: string;
        max_tokens: number;
        system: { cache_control: unknown }[];
      },
    ];
    expect(req.model).toBe('claude-haiku-5-5');
    expect(req.max_tokens).toBe(1024);
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(logged()).toMatchObject({
      feature: 'triage',
      outcome: AiRunOutcome.OK,
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 4000,
      costUsd: aiCostUsd(usage),
      userId: 'u1',
      subject: 'case:1',
    });
  });

  it('passes output_config through and parses a structured reply', async () => {
    const { svc, prisma, create, logged } = setup();
    const outputConfig = {
      effort: 'low' as const,
      format: { type: 'json_schema' as const, schema: { type: 'object' } },
    };
    create.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"category":"PAYMENTS"}' }],
      usage,
    });
    await expect(svc.run('triage', { ...input, outputConfig })).resolves.toEqual({
      ok: true,
      text: '{"category":"PAYMENTS"}',
      json: { category: 'PAYMENTS' },
    });
    expect((create.mock.calls[0] as [{ output_config: unknown }])[0].output_config).toEqual(outputConfig);

    // Unparseable structured output is an error, not a half answer.
    create.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"category":' }],
      usage,
    });
    await expect(svc.run('triage', { ...input, outputConfig })).resolves.toEqual({
      ok: false,
      reason: 'error',
      detail: 'invalid JSON',
    });
    expect(logged().outcome).toBe(AiRunOutcome.OK);
    const second = prisma.aiRun.create.mock.calls[1] as [{ data: { outcome: AiRunOutcome } }];
    expect(second[0].data.outcome).toBe(AiRunOutcome.ERROR);
  });

  it('is disabled until the feature is switched on, without calling Claude', async () => {
    const { svc, create } = setup({ enabled: false });
    await expect(svc.run('triage', input)).resolves.toEqual({
      ok: false,
      reason: 'disabled',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('stops a user at the daily cap', async () => {
    const { svc, create } = setup({ used: 20 });
    await expect(svc.run('triage', input)).resolves.toEqual({
      ok: false,
      reason: 'capped',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('returns a refusal as refused and logs it', async () => {
    const { svc, create, logged } = setup();
    create.mockResolvedValue({ stop_reason: 'refusal', content: [], usage });
    await expect(svc.run('triage', input)).resolves.toEqual({
      ok: false,
      reason: 'refused',
    });
    expect(logged().outcome).toBe(AiRunOutcome.REFUSED);
  });

  it('treats a reply cut off at max_tokens as an error', async () => {
    const { svc, create } = setup();
    create.mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: 'half an ans' }],
      usage,
    });
    await expect(svc.run('triage', input)).resolves.toEqual({
      ok: false,
      reason: 'error',
      detail: 'stop_reason max_tokens',
    });
  });

  it('never throws: API and log failures fall back', async () => {
    const { svc, prisma, create, logged } = setup();
    create.mockRejectedValue(new Error('529 overloaded'));
    await expect(svc.run('triage', input)).resolves.toEqual({
      ok: false,
      reason: 'error',
      detail: '529 overloaded',
    });
    expect(logged()).toMatchObject({
      outcome: AiRunOutcome.ERROR,
      costUsd: 0,
    });

    create.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
      usage,
    });
    prisma.aiRun.create.mockRejectedValue(new Error('db down'));
    await expect(svc.run('triage', input)).resolves.toEqual({
      ok: true,
      text: 'ok',
    });
  });

  it('folds usage rows per feature: outcomes, cost, cache share, latency', async () => {
    const { svc, prisma } = setup();
    const row = (feature: string, outcome: AiRunOutcome, n: number, cost: string, input: number, read: number, ms: number) => ({
      feature,
      outcome,
      _count: { _all: n },
      _sum: { costUsd: cost, latencyMs: ms, inputTokens: input, cacheReadTokens: read, cacheWriteTokens: 0 },
    });
    (prisma.aiRun as Record<string, jest.Mock>).groupBy = jest.fn().mockResolvedValue([
      row('bot', AiRunOutcome.OK, 3, '0.00123', 1000, 3000, 900),
      row('bot', AiRunOutcome.ERROR, 1, '0', 0, 0, 100),
      row('triage', AiRunOutcome.REFUSED, 2, '0.00005', 500, 0, 400),
    ]);
    await expect(svc.usage(30)).resolves.toEqual({
      bot: { runs: 4, ok: 3, refused: 0, error: 1, costUsd: 0.0012, cacheShare: 0.75, avgLatencyMs: 250 },
      triage: { runs: 2, ok: 0, refused: 2, error: 0, costUsd: 0.0001, cacheShare: 0, avgLatencyMs: 200 },
    });
  });

  it('prices Haiku 5.5, 5× above 100K prompt tokens', () => {
    // 1000×0.10 + 200×0.50 + 4000×0.01 = 240 per million.
    expect(aiCostUsd(usage)).toBeCloseTo(0.00024, 10);
    expect(aiCostUsd({ ...usage, input_tokens: 100_000 })).toBeCloseTo(
      (5 * (100_000 * 0.1 + 200 * 0.5 + 4000 * 0.01)) / 1e6,
      10,
    );
  });
});
