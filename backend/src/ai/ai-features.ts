/**
 * Every AI feature and its limits. `maxTokens` caps one reply; the daily cap
 * counts a user's calls to that feature over the last 24 hours. `dailyUsd` caps
 * the feature's spend over the last 24 hours, system calls included, so one
 * runaway feature can't reach the Anthropic Console limit and take the rest
 * down with it ($25 a month; no ceiling × 30 days gets there alone). A feature
 * also has to be switched on in PlatformConfig.aiEnabledFeatures before it runs.
 */
// ponytail: ceilings are guesses about 10× normal use; tune from /admin/ai-usage after a week.
export const AI_FEATURES = {
  triage: { maxTokens: 1024, dailyCapPerUser: 20, dailyUsd: 0.1 }, // D13
  bot: { maxTokens: 2048, dailyCapPerUser: 40, dailyUsd: 0.3 }, // D14
  desk: { maxTokens: 2048, dailyCapPerUser: 200, dailyUsd: 0.2 }, // D15
  event_draft: { maxTokens: 4096, dailyCapPerUser: 20, dailyUsd: 0.2 }, // M1
  report_summary: { maxTokens: 1024, dailyCapPerUser: 20, dailyUsd: 0.1 }, // M3
  comms_draft: { maxTokens: 4096, dailyCapPerUser: 30, dailyUsd: 0.2 }, // C17 Write with AI (was AI6)
  // Haiku 5.5 thinks by default and thinking counts toward max_tokens: a 1,000-word
  // post as JSON ran out at 8192, then at 16k. The SDK's non-streaming limit only
  // applies without a timeout, and AiService always sets one.
  // Three posts a day cost about $0.50, so $0.50 capped the third (UNIFESTO-BACKEND-C).
  blog_writer: { maxTokens: 32_000, dailyCapPerUser: 0, dailyUsd: 0.8 }, // auto-blog; system calls, no user
  // Safety checks: system calls, so no user cap and they never count toward a space's AI requests.
  risk_screen: { maxTokens: 2048, dailyCapPerUser: 0, dailyUsd: 0.1 }, // AI3: new spaces, first event publish
  broadcast_check: { maxTokens: 2048, dailyCapPerUser: 0, dailyUsd: 0.2 }, // AI19: organiser broadcasts
} as const;
export type AiFeature = keyof typeof AI_FEATURES;

/** Every feature key, for the Apex AI switches and DTO validation. */
export const AI_FEATURE_KEYS = Object.keys(AI_FEATURES) as AiFeature[];
