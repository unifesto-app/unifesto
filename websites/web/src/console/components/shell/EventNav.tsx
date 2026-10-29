"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  CaretDown,
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
  Trophy,
  Bed,
  ArrowCounterClockwise,
  ListChecks,
  ChatsCircle,
  Timer,
  Star,
} from "@unifesto/unicon/react";
import type { Icon } from "@unifesto/unicon/react";
import { useAccess, type Capability, type SpaceFeature } from "@/console/lib/context/SessionContext";
import { cn } from "@/console/lib/utils/cn";
import { AssistInboxLink } from "./AssistInboxLink";

interface EventNavItem {
  href: string;
  label: string;
  icon: Icon;
  exact?: boolean;
  /** Capability the role must hold to see this section. Absent = any operator. */
  requires?: Capability;
  /**
   * The backend checks `can()` on the event itself, which co-hosting doesn't
   * reach: hide it from a co-host Space Admin, whose only event capability is
   * `event:edit` (the canManageEvent fallback). Every real path to `event:edit`
   * also carries the mandatory `event:view`, so that is the signal.
   */
  ownersOnly?: boolean;
  /** Plan feature that must be enabled. Absent = not plan-gated. */
  feature?: SpaceFeature;
}

interface EventNavGroup {
  label?: string;
  items: EventNavItem[];
  /** Folded away by default; opens itself when one of its pages is active. */
  advanced?: boolean;
}

// Grouped by how an organiser works an event: run it, count the money, shape
// the experience, then configure it. Rarely-used structure tools sit folded
// under "Advanced" at the bottom. Each item carries
// the capability (role) and/or plan feature it needs — the nav filters through
// the same checks the pages and backend enforce.
const NAV_GROUPS: EventNavGroup[] = [
  { items: [{ href: "", label: "Overview", icon: SquaresFour, exact: true }] },
  {
    label: "Registrations",
    items: [
      { href: "/rsvps", label: "RSVPs", icon: Lightning, requires: "event:manage-attendees" },
      { href: "/tickets", label: "Tickets", icon: Ticket, requires: "event:edit" },
      { href: "/coupons", label: "Discount codes", icon: Tag, requires: "event:edit", ownersOnly: true },
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
      { href: "/refunds", label: "Refunds", icon: ArrowCounterClockwise, requires: "event:manage-money" },
      { href: "/reports", label: "Reports", icon: ChartBar, requires: "event:publish", feature: "hasAnalytics" },
    ],
  },
  {
    label: "Grow",
    items: [
      // Partners live inside Tracking.
      { href: "/tracking", label: "Tracking", icon: ChartLineUp },
    ],
  },
  {
    label: "Experience",
    items: [
      { href: "/content", label: "Content", icon: FileText, requires: "event:edit" },
      { href: "/polls", label: "Live polls", icon: ListChecks, requires: "event:edit", ownersOnly: true },
      { href: "/questions", label: "Live Q&A", icon: ChatsCircle, requires: "event:edit", ownersOnly: true },
      { href: "/quizzes", label: "Live quizzes", icon: Timer, requires: "event:edit", ownersOnly: true },
      { href: "/certificates", label: "Certificates", icon: Certificate, requires: "event:edit", ownersOnly: true, feature: "hasCertificates" },
      { href: "/feedback", label: "Feedback", icon: Star, requires: "event:edit" },
      // Unifesto Sprint (hackathon mode). Plan gating is shown in-page.
      { href: "/hackathon", label: "Sprint", icon: Trophy, requires: "event:manage-leaderboard" },
      // Unifesto Stay. Crew get the property desk; setup and approvals are gated in-page.
      { href: "/stays", label: "Stay", icon: Bed, requires: "event:check-in" },
    ],
  },
  {
    label: "Configure",
    items: [
      { href: "/team", label: "Team", icon: UsersFour, requires: "event:assign-crew" },
      { href: "/settings", label: "Settings", icon: Gear, requires: "event:edit" },
    ],
  },
  {
    label: "Advanced",
    advanced: true,
    items: [
      { href: "/occurrences", label: "Occurrences", icon: ArrowsClockwise, requires: "event:edit" },
      { href: "/sub-events", label: "Sub-events", icon: Stack, requires: "event:edit" },
      { href: "/co-hosting", label: "Co-Hosting", icon: ShareNetwork, requires: "event:assign-crew" },
    ],
  },
];

interface EventNavProps {
  eventId: string;
  onNavigate?: () => void;
  collapsed?: boolean;
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
}: EventNavProps) {
  const pathname = usePathname();
  // This event's capabilities from the backend: event-only operators, per-space
  // overrides and Space Admin inheritance included.
  const { can, hasFeature } = useAccess(eventId);
  const baseUrl = `/console/events/${eventId}`;

  const navGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (i) =>
        (!i.requires || can(i.requires)) &&
        (!i.ownersOnly || can("event:view")) &&
        (!i.feature || hasFeature(i.feature))
    ),
  })).filter((group) => group.items.length > 0);

  const isActive = (item: EventNavItem) => {
    const fullPath = `${baseUrl}${item.href}`;
    if (item.exact) return pathname === fullPath;
    return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
  };

  return (
    <div className={cn("flex min-h-full flex-col", collapsed ? "p-2" : "p-4")}>
      {/* Back to the space-level events list */}
      <Link
        href="/console/events"
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
      {/* Event-only operators have no space rail; renders nothing for everyone else. */}
      <AssistInboxLink collapsed={collapsed} onNavigate={onNavigate} />

      <nav className={cn("flex-1", collapsed ? "space-y-2" : "space-y-5")}>
        {navGroups.map((group, groupIdx) => {
          const links = (
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
          );

          // Advanced tools fold away in the full rail; the icon-only rail
          // keeps them inline since it has no labels to fold under.
          if (group.advanced && !collapsed) {
            return (
              <details key={group.label} open={group.items.some(isActive)} className="group">
                <summary className="mb-1 flex cursor-pointer list-none items-center justify-between rounded px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                  {group.label}
                  <CaretDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                </summary>
                {links}
              </details>
            );
          }

          return (
            <div key={group.label ?? `group-${groupIdx}`}>
              {group.label &&
                (collapsed ? (
                  groupIdx > 0 && <div className="mx-2 mb-2 border-t border-border" />
                ) : (
                  <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                ))}
              {links}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
