import { AiRunOutcome } from '@prisma/client';
import { reportError } from '../common/observability';
import { AiService, aiCostUsd } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformConfigService } from '../subscription/platform-config.service';

jest.mock('../common/observability', () => ({ reportError: jest.fn() }));

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

  beforeEach(() => jest.mocked(reportError).mockClear());

  function setup(
    opts: { enabled?: boolean; used?: number; spent?: number; lastHour?: Partial<Record<AiRunOutcome, number>> } = {},
  ) {
    const prisma = {
      aiRun: {
        count: jest.fn().mockResolvedValue(opts.used ?? 0),
        create: jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: opts.spent === undefined ? null : String(opts.spent) } }),
        groupBy: jest.fn().mockResolvedValue(
          Object.entries(opts.lastHour ?? {}).map(([outcome, n]) => ({ outcome, _count: { _all: n } })),
        ),
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

  it("stops a feature at its 24-hour spend ceiling, system calls included", async () => {
    const { svc, prisma, create } = setup({ spent: 0.5 });
    // blog_writer has no user, so no per-user cap; the $0.50 ceiling still holds.
    await expect(svc.run('blog_writer', { ...input, userId: undefined })).resolves.toEqual({
      ok: false,
      reason: 'capped',
    });
    expect(create).not.toHaveBeenCalled();
    const [where] = prisma.aiRun.aggregate.mock.calls[0] as [{ where: { feature: string } }];
    expect(where.where.feature).toBe('blog_writer');
  });

  it('logs the space and whether the call counts toward its plan', async () => {
    const { svc, prisma, create, logged } = setup();
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage });
    await svc.run('event_draft', { ...input, spaceId: 's1', billable: true });
    expect(logged()).toMatchObject({ spaceId: 's1', billable: true });
    await svc.run('triage', input);
    const second = prisma.aiRun.create.mock.calls[1] as [{ data: Record<string, unknown> }];
    expect(second[0].data).toMatchObject({ spaceId: undefined, billable: false });
  });

  it('tells Sentry once when spend crosses 80% of the ceiling', async () => {
    // triage: $0.10 ceiling, so the line is $0.08; a $0.00024 run from just under it crosses.
    const { svc, create } = setup({ spent: 0.0799 });
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage });
    await svc.run('triage', input);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(jest.mocked(reportError).mock.calls[0][1]).toEqual({ ai: 'triage', aiAlert: 'spend' });

    // Already past the line: no second alert.
    const past = setup({ spent: 0.085 });
    past.create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage });
    await past.svc.run('triage', input);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('tells Sentry when errors and refusals cross 20% of the last hour', async () => {
    // This refusal makes 2 bad of 6: over, and 1 of 5 before it was not.
    const { svc, create } = setup({ lastHour: { OK: 4, REFUSED: 1, ERROR: 1 } });
    create.mockResolvedValue({ stop_reason: 'refusal', content: [], usage });
    await svc.run('triage', input);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(jest.mocked(reportError).mock.calls[0][2]).toEqual(['ai-alert', 'failures', 'triage']);

    // Already over before this run (2 of 5): no repeat.
    const still = setup({ lastHour: { OK: 3, ERROR: 3 } });
    still.create.mockResolvedValue({ stop_reason: 'refusal', content: [], usage });
    await still.svc.run('triage', input);
    // Too few runs to judge (1 of 2).
    const few = setup({ lastHour: { OK: 1, ERROR: 1 } });
    few.create.mockRejectedValue(new Error('529 overloaded'));
    await few.svc.run('triage', input);
    expect(reportError).toHaveBeenCalledTimes(1);
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

  it('prices Haiku 5.5, 5× above 100K prompt tokens, plus web searches', () => {
    // 1000×0.10 + 200×0.50 + 4000×0.01 = 240 per million.
    expect(aiCostUsd(usage)).toBeCloseTo(0.00024, 10);
    expect(aiCostUsd({ ...usage, server_tool_use: { web_search_requests: 3, web_fetch_requests: 0 } as never })).toBeCloseTo(0.03024, 10);
    expect(aiCostUsd({ ...usage, input_tokens: 100_000 })).toBeCloseTo(
      (5 * (100_000 * 0.1 + 200 * 0.5 + 4000 * 0.01)) / 1e6,
      10,
    );
  });
});
