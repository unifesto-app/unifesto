/* FAQ block for blog posts (P16). Authors end a post with:

     ## FAQ            (or "## Frequently asked questions")
     ### A question?
     The answer, one or more paragraphs.

   The section renders as normal Markdown; this pulls the same Q&A out for
   FAQPage JSON-LD so search engines and AI assistants can quote it. The
   section ends at the next `## ` heading or the end of the post. */

export type BlogFaq = { q: string; a: string };

const FAQ_HEADING = /^##\s+(faq|faqs|frequently asked questions)\s*$/im;

/** Markdown inline syntax to plain text: links keep their label, emphasis and code marks go. */
const plain = (md: string) =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function postFaqs(content: string): BlogFaq[] {
  const start = content.search(FAQ_HEADING);
  if (start < 0) return [];
  const afterHeading = content.slice(start).replace(FAQ_HEADING, "");
  const end = afterHeading.search(/^##\s/m);
  const section = end < 0 ? afterHeading : afterHeading.slice(0, end);

  return section
    .split(/^###\s+/m)
    .slice(1)
    .map((chunk) => {
      const [first, ...rest] = chunk.split("\n");
      return { q: plain(first), a: plain(rest.join("\n")) };
    })
    .filter((f) => f.q && f.a);
}
