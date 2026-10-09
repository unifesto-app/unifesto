"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  SquaresFour,
  Ticket,
  Users,
  CheckCircle,
  Receipt,
  Certificate,
  UsersFour,
  ShareNetwork,
  Gear,
  Lightning,
  FileText,
  ChartBar,
  Hourglass,
  Stack,
  ArrowsClockwise,
  Tag,
  WhatsappLogo,
  ChartLineUp,
  Handshake,
  Trophy,
} from "@unifesto/unicon/react";
import type { Icon } from "@unifesto/unicon/react";
import { useSession, type SpaceFeatures } from "@/lib/context/SessionContext";
import { can, type Capability, type SpaceAppRole } from "@/lib/types/rbac";
import { cn } from "@/lib/utils/cn";

interface EventNavItem {
  href: string;
  label: string;
  icon: Icon;
  exact?: boolean;
  /** Capability the role must hold to see this section. Absent = any operator. */
  requires?: Capability;
  /** Plan feature that must be enabled. Absent = not plan-gated. */
  feature?: keyof SpaceFeatures;
}

interface EventNavGroup {
  label?: string;
  items: EventNavItem[];
}

// Grouped by how an organiser works an event: run it, count the money, shape
// the experience, wire up its structure, then configure it. Each item carries
// the capability (role) and/or plan feature it needs — the nav filters through
// the same checks the pages and backend enforce.
const NAV_GROUPS: EventNavGroup[] = [
  { items: [{ href: "", label: "Overview", icon: SquaresFour, exact: true }] },
  {
    label: "Registrations",
    items: [
      { href: "/rsvps", label: "RSVPs", icon: Lightning, requires: "event:manage-attendees" },
      { href: "/tickets", label: "Tickets", icon: Ticket, requires: "event:edit" },
      { href: "/coupons", label: "Discount codes", icon: Tag, requires: "event:edit" },
      { href: "/attendees", label: "Attendees", icon: Users, requires: "event:manage-attendees" },
      { href: "/waitlist", label: "Waiting list", icon: Hourglass, requires: "event:manage-attendees", feature: "hasWaitlist" },
      { href: "/whatsapp", label: "WhatsApp group", icon: WhatsappLogo, requires: "event:manage-attendees" },
      { href: "/checkin", label: "Check-in", icon: CheckCircle, requires: "event:check-in" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/transactions", label: "Transactions", icon: Receipt, requires: "event:publish" },
      { href: "/reports", label: "Reports", icon: ChartBar, requires: "event:publish", feature: "hasAnalytics" },
    ],
  },
  {
    label: "Grow",
    items: [
      { href: "/tracking", label: "Tracking", icon: ChartLineUp },
      { href: "/partners", label: "Partners", icon: Handshake },
    ],
  },
  {
    label: "Experience",
    items: [
      { href: "/content", label: "Content", icon: FileText, requires: "event:edit" },
      { href: "/certificates", label: "Certificates", icon: Certificate, requires: "event:edit", feature: "hasCertificates" },
      // Unifesto Sprint (hackathon mode). Plan gating is shown in-page.
      { href: "/hackathon", label: "Sprint", icon: Trophy, requires: "event:manage-attendees" },
    ],
  },
  {
    label: "Structure",
    items: [
      { href: "/occurrences", label: "Occurrences", icon: ArrowsClockwise, requires: "event:edit" },
      { href: "/sub-events", label: "Sub-events", icon: Stack, requires: "event:edit" },
      { href: "/team", label: "Team", icon: UsersFour, requires: "event:assign-curators" },
      { href: "/co-hosting", label: "Co-Hosting", icon: ShareNetwork, requires: "event:assign-curators" },
    ],
  },
  { label: "Configure", items: [{ href: "/settings", label: "Settings", icon: Gear, requires: "event:edit" }] },
];

/** Plan-gate check. Unknown flags (still loading) resolve to visible. */
function featureEnabled(features: SpaceFeatures | null, key: keyof SpaceFeatures): boolean {
  return features === null ? true : Boolean(features[key]);
}

/** Keep only the sections this role + plan can reach; drop groups left empty. */
function visibleGroups(
  groups: EventNavGroup[],
  role: SpaceAppRole,
  features: SpaceFeatures | null
): EventNavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (i) =>
          (!i.requires || can(role, i.requires)) &&
          (!i.feature || featureEnabled(features, i.feature))
      ),
    }))
    .filter((group) => group.items.length > 0);
}

interface EventNavProps {
  eventId: string;
  onNavigate?: () => void;
  collapsed?: boolean;
  /**
   * Role to gate sections by. Defaults to the space-level `currentRole`; the
   * layout passes the user's EVENT-scoped role for event-only operators (whose
   * `currentRole` is `none`), so their curator/crew sections still show.
   */
  roleOverride?: SpaceAppRole;
}

/**
 * The left rail's contents while drilled into an event. Replaces `SpaceNav` in
 * the single shared rail (desktop) / drawer (mobile), so the event's sections
 * take over the whole rail rather than crowding into a second column. A "back
 * to events" control returns to the space-level nav.
 */
export function EventNav({
  eventId,
  onNavigate,
  collapsed = false,
  roleOverride,
}: EventNavProps) {
  const pathname = usePathname();
  const { currentRole, features } = useSession();
  const role = roleOverride ?? currentRole;
  const baseUrl = `/dashboard/events/${eventId}`;

  const navGroups = visibleGroups(NAV_GROUPS, role, features);

  const isActive = (item: EventNavItem) => {
    const fullPath = `${baseUrl}${item.href}`;
    if (item.exact) return pathname === fullPath;
    return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
  };

  return (
    <div className={cn("flex min-h-full flex-col", collapsed ? "p-2" : "p-4")}>
      {/* Back to the space-level events list */}
      <Link
        href="/dashboard/events"
        onClick={onNavigate}
        title={collapsed ? "All events" : undefined}
        className={cn(
          "mb-4 flex items-center rounded-lg text-sm font-semibold text-foreground transition-colors hover:bg-muted",
          collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2"
        )}
      >
        <ArrowLeft className="h-[18px] w-[18px] flex-shrink-0" />
        {!collapsed && "All events"}
      </Link>

      <nav className={cn("flex-1", collapsed ? "space-y-2" : "space-y-5")}>
        {navGroups.map((group, groupIdx) => (
          <div key={group.label ?? `group-${groupIdx}`}>
            {group.label &&
              (collapsed ? (
                groupIdx > 0 && <div className="mx-2 mb-2 border-t border-border" />
              ) : (
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
              ))}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={`${baseUrl}${item.href}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center rounded-lg text-sm transition-colors duration-150",
                      collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2",
                      active
                        ? "bg-primary-soft font-semibold text-primary"
                        : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon
                      className="h-[18px] w-[18px] flex-shrink-0"
                      weight={active ? "fill" : "regular"}
                    />
                    {!collapsed && item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
