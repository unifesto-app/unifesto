import {
  SquaresFour,
  CalendarBlank,
  VideoCamera,
  Users,
  Lifebuoy,
  Gear,
  TreeStructure,
  Bank,
  ArrowsClockwise,
  Money,
  Wallet,
  PaintBrush,
  CreditCard,
  ShieldCheck,
  EnvelopeSimple,
  Handshake,
  Funnel,
  ChartLineUp,
  Tray,
  Globe,
} from "@unifesto/unicon/react";
import type { Icon } from "@unifesto/unicon/react";
import {
  accessCan,
  featureOn,
  type Capability,
  type SpaceFeature,
} from "@/console/lib/context/SessionContext";
import type { SpaceAccess } from "@/console/lib/api/spaces-api";

export interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  exact?: boolean;
  /** Capability required to see this item; absent = visible to any operator. */
  requires?: Capability;
  /** Plan feature that must be on. Absent = not plan-gated. */
  feature?: SpaceFeature;
  /** Extra terms the command palette matches against (beyond the label). */
  keywords?: string;
  /** Reachable from the command palette only; the sidebar shows its parent. */
  paletteOnly?: boolean;
  /** Shows the space desk's unread case count. */
  unreadBadge?: boolean;
}

export interface NavGroup {
  /** Section header; omitted for the top (Overview) group so it reads as a lead item. */
  label?: string;
  items: NavItem[];
}

export const BASE_URL = "/dashboard";

// Workflow-based grouping. Every href is relative to the space base
// (`/dashboard`) — the current space comes from SessionContext, not the URL.
// Items carry the capability they need; the nav filters through the same
// matrix the backend enforces, so a Crew member never sees Finance.
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: "", label: "Overview", icon: SquaresFour, exact: true, keywords: "home dashboard" }],
  },
  {
    label: "Programming",
    items: [
      { href: "/events", label: "Events", icon: CalendarBlank, keywords: "event" },
      { href: "/sessions", label: "Sessions", icon: VideoCamera, requires: "space:create-event", feature: "hasSessions", keywords: "online live" },
    ],
  },
  {
    label: "Community",
    items: [
      { href: "/members", label: "Members", icon: Users, requires: "space:manage-members", keywords: "team people crew" },
      { href: "/email", label: "Email", icon: EnvelopeSimple, requires: "space:manage-email", keywords: "campaigns templates marketing" },
      { href: "/sponsors", label: "Sponsors", icon: Handshake, requires: "space:manage-sponsors", feature: "hasSponsors", keywords: "sponsors partners tiers" },
      { href: "/leads", label: "Leads", icon: Funnel, requires: "space:manage-sponsors", feature: "hasSponsors", keywords: "leads funnel interest inquiry notify crm" },
      { href: "/tracking", label: "Tracking", icon: ChartLineUp, keywords: "traffic utm short links sources analytics views" },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        href: "/financials",
        label: "Finance",
        icon: Wallet,
        requires: "space:manage-money",
        keywords: "revenue earnings payouts refunds bank account money analytics",
      },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/billing", label: "Plan & billing", icon: CreditCard, requires: "space:manage-billing", keywords: "subscription plan upgrade" },
      { href: "/iam", label: "IAM", icon: ShieldCheck, requires: "space:manage-members", keywords: "roles permissions access" },
      { href: "/settings", label: "Settings", icon: Gear, requires: "space:manage-members", keywords: "profile visibility" },
      { href: "/settings/branding", label: "Branding", icon: PaintBrush, requires: "space:manage-settings", keywords: "white-label branding colour color accent logo font domain", paletteOnly: true },
    ],
  },
  {
    label: "Support",
    items: [
      {
        href: "/assist",
        label: "Assist inbox",
        icon: Tray,
        requires: "event:manage-support",
        keywords: "assist desk cases attendee questions help inbox",
        unreadBadge: true,
      },
      { href: "/support", label: "Support", icon: Lifebuoy, keywords: "help ticket contact unifesto" },
    ],
  },
];

// SubSpaces navigation item — only shown for SUPER spaces with children.
export const SUBSPACES_NAV_ITEM: NavItem = {
  href: "/subspaces",
  label: "SubSpaces",
  icon: TreeStructure,
  requires: "space:manage-members",
  keywords: "child spaces sub-org",
};

/** Keep only the items this access (capability + plan) reaches; drop groups left empty. */
export function visibleGroups(groups: NavGroup[], access: SpaceAccess | null): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (i) =>
          (!i.requires || accessCan(access, i.requires)) &&
          (!i.feature || featureOn(access, i.feature))
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Prepends the SubSpaces item to the "Admin" group when the current space is a
 * SUPER space with children. Managing child spaces is an admin concern, so it
 * leads that group.
 */
export function withSubspaces(groups: NavGroup[], subOrgCount: number): NavGroup[] {
  if (subOrgCount <= 0) return groups;
  return groups.map((group) => {
    if (group.label !== "Admin") return group;
    return { ...group, items: [SUBSPACES_NAV_ITEM, ...group.items] };
  });
}

// Unifesto Orbit: only on campus spaces, for the campus's Orbit Lead.
export const ORBIT_NAV_ITEM: NavItem = {
  href: "/orbit",
  label: "Orbit",
  icon: Globe,
  requires: "space:manage-members",
  keywords: "orbit campus clubs tier leaderboard",
};

/**
 * A campus is a top-level SUPER space. `type` arrives as the backend's
 * SUPER/REGULAR (from /users/me/spaces), not the UI `SpaceType` labels.
 */
export function isCampus(space: { type?: string; parentSpaceId?: string | null }): boolean {
  return space.type === "SUPER" && !space.parentSpaceId;
}

/**
 * The role- and space-aware nav, resolved once. Both the sidebar and the
 * command palette build from this so they can never drift out of sync.
 */
export function resolveNavGroups(
  space: { sub_org_count: number; type?: string; parentSpaceId?: string | null },
  access: SpaceAccess | null,
): NavGroup[] {
  const groups = withSubspaces(NAV_GROUPS, space.sub_org_count);
  const withOrbit = isCampus(space)
    ? [groups[0], { label: "Orbit", items: [ORBIT_NAV_ITEM] }, ...groups.slice(1)]
    : groups;
  return visibleGroups(withOrbit, access);
}
