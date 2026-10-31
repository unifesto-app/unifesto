"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
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
  Lock,
} from "@unifesto/unicon/react";
import type { Icon } from "@unifesto/unicon/react";
import { useAccess, type Capability, type SpaceFeature } from "@/console/lib/context/SessionContext";
import { getPlanCatalog, PLAN_LABEL, PLAN_ORDER, type PlanInfo } from "@/console/lib/api/subscriptions-api";
import { cn } from "@/console/lib/utils/cn";
import { QuestionsLink } from "./QuestionsLink";
import { BackLink, NAV_ITEM_ACTIVE } from "./SpaceNav";

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
  /** Plan feature it needs. Off this plan, it shows locked rather than hidden (Q25). */
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
export const EVENT_NAV_GROUPS: EventNavGroup[] = [
  { items: [{ href: "", label: "Dashboard", icon: SquaresFour, exact: true }] },
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

// Plans cheapest first, from the public catalog: fetched once per page load to
// name where a locked section lives.
let plansCheapestFirst: Promise<PlanInfo[]> | null = null;

function usePlans() {
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  useEffect(() => {
    plansCheapestFirst ??= getPlanCatalog().then(({ data }) =>
      (data?.plans ?? []).sort((a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan))
    );
    let live = true;
    void plansCheapestFirst.then((p) => live && setPlans(p));
    return () => {
      live = false;
    };
  }, []);
  return plans;
}

/**
 * The left rail's contents while drilled into an event. Replaces `SpaceNav` in
 * the single shared rail (desktop) / drawer (mobile), so the event's sections
 * take over the whole rail rather than crowding into a second column. A "back
 * to events" control returns to the space-level nav.
 */
/** This event's sections, filtered by what I may do there. Shared by the icon rail and the sidebar tree. */
function useEventNavGroups(eventId: string) {
  // This event's capabilities from the backend: event-only operators, per-space
  // overrides and Space Admin inheritance included.
  const { can, hasFeature } = useAccess(eventId);
  const plans = usePlans();
  return EVENT_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((i) => (!i.requires || can(i.requires)) && (!i.ownersOnly || can("event:view")))
      .map((i) => {
        const f = i.feature;
        if (!f || hasFeature(f)) return { ...i, locked: null };
        const plan = plans.find((p) => p[f]);
        return { ...i, locked: plan ? `Available on ${PLAN_LABEL[plan.plan]}` : "Not on this plan" };
      }),
  })).filter((group) => group.items.length > 0);
}

export function EventNav({
  eventId,
  onNavigate,
  collapsed = false,
}: EventNavProps) {
  const pathname = usePathname();
  const baseUrl = `/console/events/${eventId}`;
  const navGroups = useEventNavGroups(eventId);

  const isActive = (item: EventNavItem) => {
    const fullPath = `${baseUrl}${item.href}`;
    if (item.exact) return pathname === fullPath;
    return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
  };

  return (
    <div className={cn("flex min-h-full flex-col", collapsed ? "p-2" : "p-4")}>
      <BackLink href="/console/events" label="All events" collapsed={collapsed} onNavigate={onNavigate} />
      {/* Event-only operators have no space rail; renders nothing for everyone else. */}
      <QuestionsLink collapsed={collapsed} onNavigate={onNavigate} />

      <nav className={cn("flex-1", collapsed ? "space-y-2" : "space-y-4")}>
        {navGroups.map((group, groupIdx) => {
          const links = (
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = !item.locked && isActive(item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    // A locked section opens the plans, where it can be unlocked.
                    href={item.locked ? "/console/billing" : `${baseUrl}${item.href}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? (item.locked ? `${item.label}: ${item.locked}` : item.label) : undefined}
                    className={cn(
                      "relative flex items-center rounded-lg text-sm transition-colors duration-150",
                      collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2",
                      active
                        ? NAV_ITEM_ACTIVE
                        : item.locked
                          ? "text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground"
                          : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon
                      className="h-[18px] w-[18px] flex-shrink-0"
                      weight={active ? "fill" : "regular"}
                    />
                    {!collapsed &&
                      (item.locked ? (
                        <>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{item.label}</span>
                            <span className="block text-xs">{item.locked}</span>
                          </span>
                          <Lock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                        </>
                      ) : (
                        item.label
                      ))}
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
                <summary className="mb-1 flex cursor-pointer list-none items-center justify-between rounded px-3 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
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
                  <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">
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
