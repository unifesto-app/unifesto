import type { NavGroup } from "./nav-config";

export interface Crumb {
  href: string;
  label: string;
}

const HOME: Crumb = { href: "/dashboard", label: "Dashboard" };
const titled = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

/**
 * Where a path sits, read off the menu: Dashboard, then the deepest menu item
 * the path is under (so Sub-spaces, not New spaces, on /dashboard/requests/
 * subspace), then a crumb per segment past it ("Details" for an id). No page
 * needs to register anything.
 */
export function trail(pathname: string, nav: NavGroup[]): Crumb[] {
  if (pathname === "/dashboard/profile") return [HOME, { href: pathname, label: "My profile" }];
  const item = nav
    .flatMap((g) => g.items)
    .filter((i) => i.href !== HOME.href && (pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!item) return [HOME];

  const crumbs = [HOME, { href: item.href, label: item.label }];
  let href = item.href;
  for (const seg of pathname.slice(item.href.length).split("/").filter(Boolean)) {
    href += `/${seg}`;
    crumbs.push({ href, label: /\d/.test(seg) ? "Details" : titled(seg) });
  }
  return crumbs;
}
