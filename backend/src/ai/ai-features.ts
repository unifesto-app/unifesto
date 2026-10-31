/**
 * Every AI feature and its limits. `maxTokens` caps one reply; the daily cap
 * counts a user's calls to that feature over the last 24 hours. A feature also
 * has to be switched on in PlatformConfig.aiEnabledFeatures before it runs.
 */
export const AI_FEATURES = {
  triage: { maxTokens: 1024, dailyCapPerUser: 20 }, // D13
  bot: { maxTokens: 2048, dailyCapPerUser: 40 }, // D14
  desk: { maxTokens: 2048, dailyCapPerUser: 200 }, // D15
  event_draft: { maxTokens: 4096, dailyCapPerUser: 20 }, // M1
  report_summary: { maxTokens: 1024, dailyCapPerUser: 20 }, // M3
  // Haiku 5.5 thinks by default and thinking counts toward max_tokens: a 1,000-word
  // post as JSON ran out at 8192. 16k stays under the SDK's non-streaming limit.
  blog_writer: { maxTokens: 16_000, dailyCapPerUser: 0 }, // auto-blog; system calls, no user
} as const;
export type AiFeature = keyof typeof AI_FEATURES;

/** Every feature key, for the Apex AI switches and DTO validation. */
export const AI_FEATURE_KEYS = Object.keys(AI_FEATURES) as AiFeature[];
