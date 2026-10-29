import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { AiRunOutcome } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformConfigService } from '../subscription/platform-config.service';
import { AI_FEATURES, type AiFeature } from './ai-features';

export const AI_MODEL = 'claude-haiku-5-5';

export { AI_FEATURES, AI_FEATURE_KEYS } from './ai-features';
export type { AiFeature } from './ai-features';

export interface AiRunInput {
  /** Stable instructions and policy. Cached, so keep anything per-request out of it. */
  system: string;
  messages: Anthropic.MessageParam[];
  /** Lower than the feature's ceiling if wanted; never higher. */
  maxTokens?: number;
  /** Who the call is for. Calls without a user skip the daily cap. */
  userId?: string;
  /** What the call is about, e.g. "case:<id>". */
  subject?: string;
  /**
   * Passed through as `output_config` (effort, structured output). With a
   * `format`, the reply is parsed and returned as `json`; unparseable is an error.
   */
  outputConfig?: Anthropic.OutputConfig;
  /** Client tools (D14 bot) or server tools (web search). Part of the cached prefix, so keep them stable. */
  tools?: Anthropic.ToolUnion[];
  /** Request timeout; defaults to the client's 30s. Web research needs longer. */
  timeoutMs?: number;
}

/**
 * `ok: false` means "send this to a human" (decision D7): the feature is off,
 * the user hit their cap, the model refused, or the call failed.
 */
export type AiResult =
  | {
      ok: true;
      text: string;
      json?: unknown;
      /** With `tools`: the reply blocks, to run its tool calls and send back. */
      content?: Anthropic.ContentBlock[];
      /** With `tools`: true when the reply asks for tool calls. */
      toolUse?: boolean;
    }
  | { ok: false; reason: 'disabled' | 'capped' | 'refused' | 'error' };

/** One feature's calls over a window (GET /admin/ai-usage). */
export interface AiUsage {
  runs: number;
  ok: number;
  refused: number;
  error: number;
  costUsd: number;
  /** Share of prompt tokens read from cache, 0 to 1. */
  cacheShare: number;
  avgLatencyMs: number;
}

/** Claude Haiku 5.5 USD per million tokens, for prompts up to 100K tokens. */
const PRICE_PER_MTOK = {
  input: 0.1,
  output: 0.5,
  cacheRead: 0.01,
  cacheWrite: 0.125,
};
/** Above this many prompt tokens every Haiku 5.5 rate is 5×. */
const LONG_PROMPT_TOKENS = 100_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function aiCostUsd(
  usage: Pick<
    Anthropic.Usage,
    | 'input_tokens'
    | 'output_tokens'
    | 'cache_read_input_tokens'
    | 'cache_creation_input_tokens'
  >,
): number {
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const prompt = usage.input_tokens + read + write;
  const rate = prompt > LONG_PROMPT_TOKENS ? 5 : 1;
  return (
    (rate *
      (usage.input_tokens * PRICE_PER_MTOK.input +
        usage.output_tokens * PRICE_PER_MTOK.output +
        read * PRICE_PER_MTOK.cacheRead +
        write * PRICE_PER_MTOK.cacheWrite)) /
    1_000_000
  );
}

/**
 * The one way the backend calls Claude (D12). Never throws into callers: every
 * failure comes back as `{ ok: false }` so the caller falls back to a human.
 * Every call that reaches the API is logged as an AiRun.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  /** Null without ANTHROPIC_API_KEY: every feature then reports `disabled`. */
  protected client: Pick<Anthropic, 'messages'> | null = process.env
    .ANTHROPIC_API_KEY
    ? new Anthropic({ timeout: 30_000, maxRetries: 1 })
    : null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformConfig: PlatformConfigService,
  ) {}

  async run(feature: AiFeature, input: AiRunInput): Promise<AiResult> {
    const limits = AI_FEATURES[feature];
    try {
      if (
        !this.client ||
        !(await this.platformConfig.isAiFeatureEnabled(feature))
      ) {
        return { ok: false, reason: 'disabled' };
      }
      if (input.userId) {
        const used = await this.prisma.aiRun.count({
          where: {
            userId: input.userId,
            feature,
            createdAt: { gte: new Date(Date.now() - DAY_MS) },
          },
        });
        if (used >= limits.dailyCapPerUser)
          return { ok: false, reason: 'capped' };
      }
    } catch (err) {
      this.logger.error(
        `AI ${feature} pre-check failed: ${(err as Error).message}`,
      );
      return { ok: false, reason: 'error' };
    }

    const started = Date.now();
    let response: Anthropic.Message | null = null;
    try {
      response = await this.client.messages.create({
        model: AI_MODEL,
        max_tokens: Math.min(
          input.maxTokens ?? limits.maxTokens,
          limits.maxTokens,
        ),
        system: [
          {
            type: 'text',
            text: input.system,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: input.messages,
        ...(input.tools ? { tools: input.tools } : {}),
        ...(input.outputConfig ? { output_config: input.outputConfig } : {}),
      }, input.timeoutMs ? { timeout: input.timeoutMs } : undefined);
    } catch (err) {
      this.logger.warn(`AI ${feature} call failed: ${(err as Error).message}`);
    }

    const text =
      response?.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim() ?? '';
    // Only a finished, non-empty answer (or a complete tool call) counts. A
    // reply cut off at max_tokens is an error: half a suggestion is worse than none.
    const toolUse = !!input.tools && response?.stop_reason === 'tool_use';
    let outcome: AiRunOutcome =
      response?.stop_reason === 'refusal'
        ? AiRunOutcome.REFUSED
        : ((response?.stop_reason === 'end_turn' ||
              response?.stop_reason === 'stop_sequence') &&
            text) ||
            toolUse
          ? AiRunOutcome.OK
          : AiRunOutcome.ERROR;
    let json: unknown;
    if (outcome === AiRunOutcome.OK && input.outputConfig?.format) {
      try {
        json = JSON.parse(text);
      } catch {
        outcome = AiRunOutcome.ERROR;
      }
    }

    await this.log(
      feature,
      input,
      outcome,
      Date.now() - started,
      response?.usage,
    );

    if (outcome === AiRunOutcome.OK) {
      if (input.tools) return { ok: true, text, content: response!.content, toolUse };
      return input.outputConfig?.format ? { ok: true, text, json } : { ok: true, text };
    }
    return {
      ok: false,
      reason: outcome === AiRunOutcome.REFUSED ? 'refused' : 'error',
    };
  }

  /**
   * Each feature's AiRun rows over the last `days`, for the Apex AI card.
   * `cacheShare` is the part of prompt tokens read from cache: near 0 on a busy
   * feature means something per-request leaked into the cached prefix.
   */
  async usage(days = 30): Promise<Record<string, AiUsage>> {
    const rows = await this.prisma.aiRun.groupBy({
      by: ['feature', 'outcome'],
      where: { createdAt: { gte: new Date(Date.now() - days * DAY_MS) } },
      _count: { _all: true },
      _sum: { costUsd: true, latencyMs: true, inputTokens: true, cacheReadTokens: true, cacheWriteTokens: true },
    });
    const out: Record<string, AiUsage & { prompt: number; cached: number; latency: number }> = {};
    for (const r of rows) {
      const f = (out[r.feature] ??= { runs: 0, ok: 0, refused: 0, error: 0, costUsd: 0, cacheShare: 0, avgLatencyMs: 0, prompt: 0, cached: 0, latency: 0 });
      const n = r._count._all;
      f.runs += n;
      f[r.outcome === AiRunOutcome.OK ? 'ok' : r.outcome === AiRunOutcome.REFUSED ? 'refused' : 'error'] += n;
      f.costUsd += Number(r._sum.costUsd ?? 0);
      f.latency += r._sum.latencyMs ?? 0;
      f.cached += r._sum.cacheReadTokens ?? 0;
      f.prompt += (r._sum.inputTokens ?? 0) + (r._sum.cacheReadTokens ?? 0) + (r._sum.cacheWriteTokens ?? 0);
    }
    return Object.fromEntries(
      Object.entries(out).map(([k, { prompt, cached, latency, ...f }]) => [
        k,
        { ...f, costUsd: Math.round(f.costUsd * 1e4) / 1e4, cacheShare: prompt ? cached / prompt : 0, avgLatencyMs: Math.round(latency / f.runs) },
      ]),
    );
  }

  private async log(
    feature: AiFeature,
    input: AiRunInput,
    outcome: AiRunOutcome,
    latencyMs: number,
    usage?: Anthropic.Usage,
  ): Promise<void> {
    const promptTokens =
      (usage?.input_tokens ?? 0) +
      (usage?.cache_read_input_tokens ?? 0) +
      (usage?.cache_creation_input_tokens ?? 0);
    if (promptTokens > LONG_PROMPT_TOKENS) {
      this.logger.warn(
        `AI ${feature} prompt was ${promptTokens} tokens (5× rate above 100K)`,
      );
    }
    try {
      await this.prisma.aiRun.create({
        data: {
          feature,
          model: AI_MODEL,
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
          cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
          costUsd: usage ? aiCostUsd(usage) : 0,
          latencyMs,
          outcome,
          userId: input.userId,
          subject: input.subject,
        },
      });
    } catch (err) {
      // The answer is still good; a lost log row must not cost the user it.
      this.logger.error(
        `AI ${feature} run not logged: ${(err as Error).message}`,
      );
    }
  }
}
