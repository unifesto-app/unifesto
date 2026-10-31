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
  ChatsCircle,
  Globe,
  House,
  Ticket,
  UserCircle,
  Heart,
  Certificate,
  Buildings,
  Bell,
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

export const BASE_URL = "/console";

// Workflow-based grouping. Every href is relative to the space base
// (`/console`) — the current space comes from SessionContext, not the URL.
// Items carry the capability they need; the nav filters through the same
// matrix the backend enforces, so a Crew member never sees Finance.
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: "/space", label: "Dashboard", icon: SquaresFour, exact: true, keywords: "space dashboard overview stats" }],
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
      { href: "/tracking", label: "Tracking", icon: ChartLineUp, keywords: "traffic utm sources analytics views" },
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
  // Help, by who's asking whom: attendees ask this space (Attendee questions);
  // this space asks Unifesto (Unifesto support). Assist is only the AI's name.
  {
    label: "Help",
    items: [
      {
        href: "/questions",
        label: "Attendee questions",
        icon: ChatsCircle,
        requires: "event:manage-support",
        keywords: "attendee questions desk cases help assist replies",
        unreadBadge: true,
      },
      { href: "/support", label: "Unifesto support", icon: Lifebuoy, keywords: "help request contact unifesto payout setup" },
    ],
  },
];

/**
 * The personal section (Track V9): /console is everyone's home, attendees
 * included. Shown to every signed-in person, above the space sections, which
 * need a role. My account is just my profile; My Spaces, notifications and
 * security are pages of their own.
 */
export const ME_GROUP: NavGroup = {
  label: "Account",
  items: [
    { href: "", label: "Dashboard", icon: House, exact: true, keywords: "home start dashboard" },
    { href: "/account/inbox", label: "Inbox", icon: Tray, keywords: "updates notifications messages" },
    { href: "/tickets", label: "My tickets", icon: Ticket, keywords: "tickets bookings registrations qr waiting list" },
    { href: "/account/support", label: "Support", icon: Lifebuoy, keywords: "my help requests ask unifesto assist refund booking" },
    { href: "/account/saved", label: "Saved events", icon: Heart, keywords: "saved bookmarks" },
    { href: "/account/certificates", label: "My certificates", icon: Certificate, keywords: "certificates" },
    // The spaces I run and the ones I joined; the sidebar opens the space I'm in under it.
    { href: "/spaces", label: "My Spaces", icon: Buildings, keywords: "spaces switch space clubs joined leave requests" },
    // The sidebar's foot (my avatar and name) opens it; ⌘K still finds it.
    { href: "/account", label: "My account", icon: UserCircle, keywords: "profile photo name username bio links", paletteOnly: true },
  ],
};

/** How I'm reached and how I sign in. */
export const SETTINGS_GROUP: NavGroup = {
  label: "Settings",
  items: [
    { href: "/account/notifications", label: "Notifications", icon: Bell, keywords: "email promotions unsubscribe" },
    { href: "/account/sign-in", label: "Security", icon: ShieldCheck, keywords: "phone google apple email sign out everywhere delete account" },
  ],
};

/** My own menus: everyone's pages, then Settings. */
export const accountGroups = (): NavGroup[] => [ME_GROUP, SETTINGS_GROUP];

/** The item this page belongs to: the longest href that matches, so Inbox (not My account) on /console/account/inbox. */
export function currentItem(items: NavItem[], pathname: string): NavItem | undefined {
  return items
    .filter((i) => {
      const href = `${BASE_URL}${i.href}`;
      return pathname === href || (!i.exact && pathname.startsWith(`${href}/`));
    })
    .sort((a, b) => b.href.length - a.href.length)[0];
}

// My Spaces too: event-only operators open it as well, and it carries the Account sidebar.
const PERSONAL = ["/tickets", "/account", "/feedback", "/spaces"].map((p) => `${BASE_URL}${p}`);

/** Pages for every signed-in person; the rest of /console needs a space role. */
export function isPersonalPath(pathname: string): boolean {
  return pathname === BASE_URL || PERSONAL.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

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
