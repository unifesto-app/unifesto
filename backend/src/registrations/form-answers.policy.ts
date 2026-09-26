import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { checkAnswers, type FormFieldLike } from './form-answers.util';

type FieldReader = {
  eventFormField: Pick<PrismaClient['eventFormField'], 'findMany'>;
};

/** The questions a ticket's form asks: its own plus any legacy event-wide ones. */
export function loadTicketFormFields(
  prisma: FieldReader,
  eventId: string,
  ticketTypeId: string | null,
): Promise<FormFieldLike[]> {
  return prisma.eventFormField.findMany({
    where: {
      eventId,
      OR: ticketTypeId
        ? [{ ticketTypeId }, { ticketTypeId: null }]
        : [{ ticketTypeId: null }],
    },
    orderBy: { order: 'asc' },
  });
}

export interface EnforceInput {
  eventId: string;
  ticketTypeId: string | null;
  /** Group tickets split questions: per-group on the registration, the rest per member. */
  isGroup: boolean;
  /** Registration-level answers: an individual's, or a group's team-wide ones. */
  formResponses?: Record<string, unknown> | null;
  /** Group members; each member's `customFields` is checked and replaced in place. */
  members?: ({ customFields?: Record<string, unknown> } | null | undefined)[];
  /**
   * Who must answer required questions:
   * - `team`: the registration-level answers.
   * - `members`: 'all', 'first' (the lead at booking; others answer when they
   *   claim their seat) or 'none'.
   */
  required: { team: boolean; members: 'all' | 'first' | 'none' };
  /** Accounts whose uploads these answers may reference. */
  uploaderIds: string[];
}

/**
 * Apply the answer policy (4.0.0 item 0.9) and return the cleaned
 * registration-level answers. Member answers are cleaned in place. Throws a
 * 400 listing the first problems.
 */
export async function enforceFormAnswers(
  prisma: FieldReader,
  input: EnforceInput,
): Promise<Record<string, unknown>> {
  const fields = await loadTicketFormFields(
    prisma,
    input.eventId,
    input.ticketTypeId,
  );
  if (fields.length === 0) return input.formResponses ?? {};

  const teamFields = input.isGroup ? fields.filter((f) => f.perGroup) : fields;
  const memberFields = input.isGroup ? fields.filter((f) => !f.perGroup) : [];
  const base = { eventId: input.eventId, uploaderIds: input.uploaderIds };
  const errors: string[] = [];

  const team = checkAnswers(teamFields, input.formResponses, {
    ...base,
    enforceRequired: input.required.team,
  });
  errors.push(...team.errors);

  if (memberFields.length) {
    (input.members ?? []).forEach((m, i) => {
      if (!m) return;
      const enforceRequired =
        input.required.members === 'all' ||
        (input.required.members === 'first' && i === 0);
      const r = checkAnswers(memberFields, m.customFields, {
        ...base,
        enforceRequired,
      });
      const who = i === 0 ? '' : `Member ${i + 1}: `;
      errors.push(...r.errors.map((e) => `${who}${e}`));
      m.customFields = r.answers;
    });
  }

  if (errors.length) {
    const more = errors.length > 3 ? ` (+${errors.length - 3} more)` : '';
    throw new BadRequestException(`${errors.slice(0, 3).join(' ')}${more}`);
  }
  return team.answers;
}
