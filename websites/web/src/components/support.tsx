/* Support building blocks shared by /support and the floating help button.
   Mirrors the mobile Support screen: grouped rows, bare icons, real
   channels only (email + WhatsApp). */

import type { ReactNode } from "react";
import { ArrowUpRight } from "@unifesto/unicon/react";
import { SITE } from "@/lib/site";

export const whatsappHref = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent("Hi Unifesto Support")}`;

/** Pre-fills the email with the page and browser under a divider, so support
    can see the context without a back-and-forth. Call on click (reads window). */
export function supportMailto() {
  const details = [`Page: ${window.location.href}`, `Browser: ${navigator.userAgent}`].join("\n");
  const body = `\n\n\n---\n${details}`;
  return `mailto:${SITE.email}?subject=${encodeURIComponent("Help with Unifesto")}&body=${encodeURIComponent(body)}`;
}

export function SupportGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 px-1 text-sm font-medium text-paper/55">{title}</h2>
      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-night-2">{children}</div>
    </section>
  );
}

type RowProps = {
  icon: ReactNode;
  label: string;
  value?: string;
  href: string;
  /** Resolve the href at click time (e.g. a mailto that reads the current page). */
  onClickHref?: () => string;
};

export function SupportRow({ icon, label, value, href, onClickHref }: RowProps) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      onClick={
        onClickHref
          ? (e) => {
              e.preventDefault();
              window.location.href = onClickHref();
            }
          : undefined
      }
      className="group flex items-center gap-4 px-4 py-3.5 transition-colors duration-150 hover:bg-night-3"
    >
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-paper">{label}</span>
        {value && <span className="block truncate text-sm text-paper/55">{value}</span>}
      </span>
      <ArrowUpRight
        weight="bold"
        className="h-4 w-4 flex-shrink-0 text-paper/40 transition-[color,transform] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-paper"
      />
    </a>
  );
}
