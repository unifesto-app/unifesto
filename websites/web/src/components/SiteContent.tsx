"use client";

import { createContext, useContext, type ReactNode } from "react";

/* K11: sections that hide while they have nothing to show. The root layout
   fills this from the API; Navbar and Footer drop the links to empty ones. */
export type EmptySection = "/blog" | "/careers";

const Empty = createContext<ReadonlySet<string>>(new Set());

export function SiteContentProvider({ empty, children }: { empty: EmptySection[]; children: ReactNode }) {
  return <Empty value={new Set(empty)}>{children}</Empty>;
}

/** Paths of sections that are empty right now (their links should not show). */
export const useEmptySections = () => useContext(Empty);

/** Renders children unless `href` is an empty section. */
export function IfNotEmpty({ href, children }: { href: string; children: ReactNode }) {
  return useEmptySections().has(href) ? null : children;
}
