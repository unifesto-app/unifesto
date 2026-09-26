/**
 * Shared profile → registration helpers. Used by individual auto-prefill (and,
 * later, group claim) so the same normalization rules apply everywhere.
 */

/**
 * Normalize a phone number to a bare 10-digit Indian mobile, or null if it
 * can't be resolved (caller should then leave the field editable rather than
 * show a wrong value). Strips non-digits, drops a leading country code (`91`)
 * or trunk `0`, and keeps the last 10 digits.
 */
export function normalizeMobile(raw?: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 10) {
    // Drop a leading 91 (country) or 0 (trunk) before taking the last 10.
    if (digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.slice(-10);
  }
  return /^[0-9]{10}$/.test(digits) ? digits : null;
}

/** The fixed options the attendee gender picker renders. */
export const ATTENDEE_GENDER_OPTIONS = [
  'Male',
  'Female',
  'Other',
  'Prefer not to say',
] as const;

/**
 * Map a stored profile gender to the value the attendee picker expects.
 *
 * The profile persists enum tokens the picker doesn't use as-is
 * (MALE/FEMALE/NON_BINARY/PREFER_NOT_TO_SAY), plus there may be legacy
 * free-text values. This returns one of `ATTENDEE_GENDER_OPTIONS` when it can,
 * otherwise the original string so the picker can show it as a pre-selected
 * custom chip (never rendered as "unfilled"). Empty/absent → ''.
 */
export function profileGenderToAttendeeOption(stored?: string | null): string {
  if (!stored) return '';
  const token = stored.trim();

  // Known enum tokens from the profile editor.
  const ENUM_MAP: Record<string, (typeof ATTENDEE_GENDER_OPTIONS)[number]> = {
    MALE: 'Male',
    FEMALE: 'Female',
    NON_BINARY: 'Other',
    PREFER_NOT_TO_SAY: 'Prefer not to say',
  };
  const mapped = ENUM_MAP[token.toUpperCase()];
  if (mapped) return mapped;

  // Legacy free-text: case-insensitive match against the picker options.
  const ci = ATTENDEE_GENDER_OPTIONS.find(
    (o) => o.toLowerCase() === token.toLowerCase(),
  );
  if (ci) return ci;

  // Unknown value — hand it back so the picker shows it as a custom chip.
  return token;
}

/**
 * Reverse of {@link profileGenderToAttendeeOption}: map an attendee-picker
 * label back to the enum token the profile stores. A custom (non-option) value
 * is passed through unchanged. Used by the "also update my profile" opt-in.
 */
export function attendeeGenderToProfileValue(option?: string | null): string {
  if (!option) return '';
  const LABEL_MAP: Record<string, string> = {
    Male: 'MALE',
    Female: 'FEMALE',
    Other: 'NON_BINARY',
    'Prefer not to say': 'PREFER_NOT_TO_SAY',
  };
  return LABEL_MAP[option] ?? option;
}

/** True when `gender` isn't one of the fixed options (→ render a custom chip). */
export function isCustomGender(gender?: string | null): boolean {
  return (
    !!gender &&
    !(ATTENDEE_GENDER_OPTIONS as readonly string[]).includes(gender)
  );
}
