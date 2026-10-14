import type { Icon } from "@unifesto/unicon/react";
import {
  SquaresFour,
  Users,
  Buildings,
  CalendarBlank,
  Receipt,
  Money,
  ArrowsClockwise,
  ClipboardText,
  Lifebuoy,
  ListChecks,
  Bank,
  Stack,
  ArrowsLeftRight,
  HandArrowUp,
  PaintBrush,
  MagicWand,
  Ticket,
  Gift,
  Tag,
  CreditCard,
  Pulse,
  Wallet,
  DeviceMobile,
  VideoCamera,
  Briefcase,
  Article,
  ShieldCheck,
  BellRinging,
  EnvelopeSimple,
  WhatsappLogo,
  Megaphone,
  LinkBreak,
  Flag,
  Lightning,
} from "@unifesto/unicon/react";

export interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Platform-staff navigation. Everything lives under a single `/dashboard`
 * tree; AppShell only renders the sidebar for platform admins.
 */
export const adminNav: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: SquaresFour, exact: true },
    ],
  },
  {
    label: "People & Spaces",
    items: [
      { href: "/dashboard/users", label: "Users", icon: Users },
      { href: "/dashboard/spaces", label: "Spaces", icon: Buildings },
      { href: "/dashboard/events", label: "Events", icon: CalendarBlank },
      { href: "/dashboard/sessions", label: "Sessions", icon: VideoCamera },
      { href: "/dashboard/categories", label: "Categories", icon: Tag },
    ],
  },
  {
    label: "Access Control",
    items: [
      { href: "/dashboard/iam", label: "IAM", icon: ShieldCheck },
    ],
  },
  {
    label: "Requests",
    items: [
      {
        href: "/dashboard/requests",
        label: "Space Requests",
        icon: ClipboardText,
        exact: true,
      },
      {
        href: "/dashboard/requests/subspace",
        label: "SubSpace Requests",
        icon: Stack,
      },
      {
        href: "/dashboard/requests/status",
        label: "Status Requests",
        icon: ArrowsLeftRight,
      },
      {
        href: "/dashboard/requests/ownership",
        label: "Ownership Transfers",
        icon: HandArrowUp,
      },
      {
        href: "/dashboard/requests/ticket-transfers",
        label: "Ticket Transfers",
        icon: Ticket,
      },
      {
        href: "/dashboard/requests/free-adds",
        label: "Free-add Requests",
        icon: Gift,
      },
    ],
  },
  {
    label: "White-label",
    items: [
      {
        href: "/dashboard/requests/white-label",
        label: "History",
        icon: PaintBrush,
        exact: true,
      },
      {
        href: "/dashboard/requests/white-label/apply",
        label: "Manage",
        icon: MagicWand,
      },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/dashboard/financials", label: "Financials", icon: Wallet },
      { href: "/dashboard/transactions", label: "Transactions", icon: Receipt },
      { href: "/dashboard/reconciliation", label: "Reconciliation", icon: ArrowsLeftRight },
      { href: "/dashboard/orphaned-payments", label: "Orphaned Payments", icon: LinkBreak },
      { href: "/dashboard/payouts", label: "Payouts", icon: Money },
      { href: "/dashboard/bank-accounts", label: "Bank Accounts", icon: Bank },
      {
        href: "/dashboard/subscriptions",
        label: "Subscriptions",
        icon: CreditCard,
        exact: true,
      },
      { href: "/dashboard/plans", label: "Plans", icon: Stack },
      { href: "/dashboard/refunds", label: "Refunds", icon: ArrowsClockwise },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/dashboard/product", label: "Product", icon: Lightning },
      { href: "/dashboard/careers", label: "Careers", icon: Briefcase },
      { href: "/dashboard/blog", label: "Blog", icon: Article },
      { href: "/dashboard/notifications", label: "Notifications", icon: BellRinging },
      { href: "/dashboard/email", label: "Email", icon: EnvelopeSimple },
      { href: "/dashboard/whatsapp", label: "WhatsApp", icon: WhatsappLogo, exact: true },
      { href: "/dashboard/whatsapp/broadcast", label: "WhatsApp Blast", icon: Megaphone },
      { href: "/dashboard/support", label: "Support", icon: Lifebuoy },
      { href: "/dashboard/content-reports", label: "Content Reports", icon: Flag },
      { href: "/dashboard/status", label: "Status", icon: Pulse },
      { href: "/dashboard/logs", label: "Logs", icon: ListChecks },
      { href: "/dashboard/app-version", label: "App Version", icon: DeviceMobile },
    ],
  },
];
