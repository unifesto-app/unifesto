// WeGoBeyond's own programmes: the home "Initiatives" grid and /initiative/[slug].
// Edited in Unifesto Apex and read with getContent() (lib/site.ts). Where nothing is
// known yet, an initiative says so rather than inventing detail. Dates stay out of
// here: dated editions come live from Unifesto (see lib/events.ts).

export type Initiative = {
  slug: string;
  name: string;
  /** Short rust label: format or status. */
  note: string;
  /** One line for the home grid. */
  body: string;
  /** The page's opening paragraph. */
  intro: string;
  /** "What happens", in order. Empty when not announced yet. */
  agenda: string[];
  /** "Who it's for". Empty hides the block. */
  audience: string;
  /**
   * Lowercase phrases that mark a Unifesto event as an edition of this initiative,
   * checked against the event's title and slug.
   * ponytail: text matching; tag events on Unifesto if it ever picks the wrong ones.
   */
  match: string[];
};
