/**
 * AI3 trigger, in a file of its own so spaces and events can emit it without
 * importing the screen (and its AI and support imports).
 */
export const RISK_SCREEN = 'ai.risk-screen';
/** After a space is created or an event is published; `actorId` is the organiser who did it. */
export type RiskScreenRequest = { actorId: string } & ({ spaceId: string } | { eventId: string });
