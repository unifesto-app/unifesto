/**
 * Read-model helpers shared by the hackathon services and LeaderboardService:
 * how a team's problem statement is selected and shown. No service imports, so
 * any service can use them without a circular import.
 */

import type { Prisma } from '@prisma/client';

/**
 * Who locked the statement in, without account ids: a named team member, or
 * the organisers (anyone not on the team, i.e. the curator who assigned it).
 */
export function setByLabel(setBy: string | null, members: { userId: string | null; name: string | null }[]) {
  if (!setBy) return null;
  const member = members.find((m) => m.userId === setBy);
  return member ? { kind: 'TEAM' as const, name: member.name } : { kind: 'ORGANISER' as const, name: null };
}

/** The team columns behind its problem statement and theme. */
export const TEAM_STATEMENT_SELECT = {
  statementId: true,
  statement: {
    select: { id: true, code: true, title: true, description: true, theme: { select: { id: true, name: true } } },
  },
  customStatementTitle: true,
  customStatementText: true,
  themeId: true,
  theme: { select: { id: true, name: true } },
  themeText: true,
  statementLockedAt: true,
  statementSetBy: true,
  statementChangedAfterEvalAt: true,
} satisfies Prisma.LeaderboardEntrantSelect;

type TeamStatementRow = Prisma.LeaderboardEntrantGetPayload<{ select: typeof TEAM_STATEMENT_SELECT }>;

/**
 * A team's problem statement as every screen shows it: one from the list
 * (with its code) or the team's own, and its theme. Null when it has none yet.
 */
export function statementView(t: TeamStatementRow) {
  const own = !t.statementId && !!t.customStatementTitle;
  if (!t.statement && !own) return null;
  const theme = t.theme ?? t.statement?.theme ?? null;
  return {
    source: own ? ('OWN' as const) : ('LIST' as const),
    statementId: t.statement?.id ?? null,
    code: t.statement?.code ?? null,
    title: (own ? t.customStatementTitle : t.statement?.title) ?? '',
    description: (own ? t.customStatementText : t.statement?.description) ?? '',
    theme: theme ? { id: theme.id, name: theme.name } : null,
    themeText: t.themeText,
    /** What to show for the theme, whichever way it was given. */
    themeLabel: theme?.name ?? t.themeText ?? null,
    lockedAt: t.statementLockedAt,
    changedAfterEvalAt: t.statementChangedAfterEvalAt,
  };
}

