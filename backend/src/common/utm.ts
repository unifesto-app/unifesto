import { NID_PATTERN } from '../notifications/nid';

/**
 * Normalise the utm_* tags an app client forwards with a registration into the
 * EventRegistration columns. Lowercased so "Instagram" and "instagram" roll up
 * together in the sources breakdown; blanks become null ("Direct").
 */
const clean = (v?: string | null): string | null => {
  const t = v?.trim().toLowerCase().slice(0, 100);
  return t ? t : null;
};

export function utmColumns(dto: {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  sourceNid?: string;
}) {
  return {
    utmSource: clean(dto.utmSource),
    utmMedium: clean(dto.utmMedium),
    utmCampaign: clean(dto.utmCampaign),
    // Kept as sent (refs are ids or kinds); anything malformed is dropped, never rejected.
    sourceNid: dto.sourceNid && NID_PATTERN.test(dto.sourceNid) ? dto.sourceNid : null,
  };
}
