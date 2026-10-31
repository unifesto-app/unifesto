import type { Criticality } from './notify.kinds';

/**
 * Which channels notify() uses, in ONE place so the product owner can tune it.
 *
 * Push always runs (when the kind has push copy): NotificationsService.send
 * applies the push prefs itself and always writes the in-app inbox copy. This
 * function only decides email on top of it.
 *
 * | criticality | email                                             |
 * |-------------|---------------------------------------------------|
 * | critical    | always (it's the receipt; ignores email opt-out)  |
 * | normal      | when push can't reach them, or push didn't land   |
 * |             | (respects the email opt-out)                      |
 * | low         | never                                             |
 *
 * WhatsApp is never a notify() channel: a standing cost decision limits it to
 * OTP, ONE registration confirmation, group invites and stats.
 */

export interface ChannelContext {
  /** Push prefs allow this category (pushEnabled + the category switch). */
  pushAllowed: boolean;
  /** At least one opted-in, server-linked UserPushDevice. */
  hasPushDevice: boolean;
  /** emailEnabled = false, or the category's email switch is off (C4). Gates optional mail only. */
  emailOptedOut: boolean;
  hasEmail: boolean;
}

export interface ChannelPlan {
  /** 'if-push-fails': send only when the push wasn't accepted. */
  email: 'always' | 'if-push-fails' | 'never';
}

export function channelsFor(
  kind: { criticality: Criticality; email?: unknown },
  ctx: ChannelContext,
): ChannelPlan {
  const canEmail = !!kind.email && ctx.hasEmail;
  const canPush = ctx.pushAllowed && ctx.hasPushDevice;

  switch (kind.criticality) {
    case 'critical':
      return { email: canEmail ? 'always' : 'never' };
    case 'normal':
      return { email: !canEmail || ctx.emailOptedOut ? 'never' : canPush ? 'if-push-fails' : 'always' };
    case 'low':
      return { email: 'never' };
  }
}
