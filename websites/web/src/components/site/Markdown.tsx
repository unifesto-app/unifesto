import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* Article Markdown (blog posts, help articles), styled for the paper surface. */

const mdComponents = {
  h1: (p: React.ComponentProps<"h1">) => (
    <h1 className="mt-12 font-display text-3xl font-bold text-paper" style={{ letterSpacing: "-0.03em" }} {...p} />
  ),
  h2: (p: React.ComponentProps<"h2">) => (
    <h2 className="mt-12 font-display text-2xl font-bold text-paper" style={{ letterSpacing: "-0.03em" }} {...p} />
  ),
  h3: (p: React.ComponentProps<"h3">) => (
    <h3 className="mt-9 text-xl font-bold text-paper" {...p} />
  ),
  p: (p: React.ComponentProps<"p">) => (
    <p className="mt-5 text-[1.0625rem] leading-[1.75] text-paper/80 [text-wrap:pretty]" {...p} />
  ),
  a: (p: React.ComponentProps<"a">) => (
    <a className="font-medium text-primary-deep underline underline-offset-4 transition-colors duration-150 hover:text-primary" {...p} />
  ),
  ul: (p: React.ComponentProps<"ul">) => (
    <ul className="mt-5 list-disc space-y-2 pl-6 text-paper/75" {...p} />
  ),
  ol: (p: React.ComponentProps<"ol">) => (
    <ol className="mt-5 list-decimal space-y-2 pl-6 text-paper/75" {...p} />
  ),
  li: (p: React.ComponentProps<"li">) => <li className="leading-relaxed" {...p} />,
  blockquote: (p: React.ComponentProps<"blockquote">) => (
    <blockquote className="mt-8 font-display text-xl font-medium leading-snug text-paper before:mr-1 before:text-primary-deep before:content-['“']" {...p} />
  ),
  code: (p: React.ComponentProps<"code">) => (
    <code className="rounded-md bg-paper/[0.08] px-1.5 py-0.5 font-mono text-[0.85em] text-paper" {...p} />
  ),
  pre: (p: React.ComponentProps<"pre">) => (
    <pre className="mt-6 overflow-x-auto rounded-2xl bg-night-2 p-6 text-sm text-paper/85" {...p} />
  ),
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  img: (p: React.ComponentProps<"img">) => (
    <img className="mt-8 w-full rounded-2xl" {...p} />
  ),
  hr: () => <hr className="my-12 h-px border-0 bg-paper/15" />,
  // GFM tables (comparison posts). Scroll sideways on phones instead of squashing.
  table: (p: React.ComponentProps<"table">) => (
    <div className="mt-8 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[0.95rem] text-paper/80" {...p} />
    </div>
  ),
  th: (p: React.ComponentProps<"th">) => (
    <th className="border-b border-paper/25 px-3 py-2.5 font-semibold text-paper" {...p} />
  ),
  td: (p: React.ComponentProps<"td">) => (
    <td className="border-b border-paper/10 px-3 py-2.5 align-top" {...p} />
  ),
};

export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {children}
    </ReactMarkdown>
  );
}
