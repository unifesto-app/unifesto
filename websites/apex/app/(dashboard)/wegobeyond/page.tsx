import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { adminNav } from "@/components/shell/nav-config";

const BLURBS: Record<string, string> = {
  "/wegobeyond/initiatives": "The home grid and every /initiative page.",
  "/wegobeyond/gallery": "The photo gallery on the home page.",
  "/wegobeyond/team": "The /crew page: speakers, hosts, mentors, judges and volunteers, each as Role at Event.",
  "/wegobeyond/press": "Releases, the boilerplate and the press contact.",
  "/wegobeyond/crew": "The Join the crew page and the options on its form.",
  "/wegobeyond/crew-signups": "Everyone who joined the crew, with a CSV export.",
  "/wegobeyond/settings": "Hero line, inboxes, contacts, social and policy links.",
};

const items = adminNav.find((g) => g.label === "WeGoBeyond")?.items.filter((i) => BLURBS[i.href]) ?? [];

/**
 * Apex › WeGoBeyond: wegobeyond.in, Unifesto's events brand. Its events come
 * from the `beyond` space; everything else on the site is edited here.
 */
export default function WegobeyondPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="WeGoBeyond"
        subtitle="What wegobeyond.in shows besides its events, which come from the beyond space. Saves go live on the site within a minute or two."
      />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex h-full gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <span>
                <span className="block text-sm font-medium text-foreground">{label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{BLURBS[href]}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
