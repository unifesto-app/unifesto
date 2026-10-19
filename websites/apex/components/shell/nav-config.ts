import type { Icon } from "@unifesto/unicon/react";
import {
  SquaresFour,
  RocketLaunch,
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
  Gavel,
  BookOpen,
  ShieldCheck,
  BellRinging,
  EnvelopeSimple,
  WhatsappLogo,
  Megaphone,
  LinkBreak,
  Flag,
  Coins,
  CloudArrowUp,
  ImageSquare,
  ChartLineUp,
  Tray,
} from "@unifesto/unicon/react";

export interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  exact?: boolean;
  /** Extra terms the ⌘K palette matches beyond the label. */
  keywords?: string;
  /** Show the Assist unread count beside it. */
  unreadBadge?: boolean;
}

export interface NavGroup {
  /** Omitted for the lead group so Dashboard + Product read as top items. */
  label?: string;
  items: NavItem[];
}

/**
 * Platform-staff navigation, grouped by job rather than by data type. One
 * source feeds the desktop rail, the mobile drawer and the ⌘K palette.
 */
export const adminNav: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: SquaresFour, exact: true, keywords: "home overview analytics" },
      { href: "/dashboard/product", label: "Product", icon: RocketLaunch, keywords: "kanban board roadmap tasks plan pm" },
    ],
  },
  {
    label: "Directory",
    items: [
      { href: "/dashboard/users", label: "Users", icon: Users, keywords: "people accounts" },
      { href: "/dashboard/spaces", label: "Spaces", icon: Buildings, keywords: "orgs tenants verify" },
      { href: "/dashboard/events", label: "Events", icon: CalendarBlank },
      { href: "/dashboard/sessions", label: "Sessions", icon: VideoCamera, keywords: "huddle live" },
      { href: "/dashboard/categories", label: "Categories", icon: Tag },
    ],
  },
  {
    label: "Requests",
    items: [
      { href: "/dashboard/requests", label: "New spaces", icon: ClipboardText, exact: true, keywords: "space requests approve" },
      { href: "/dashboard/requests/subspace", label: "Sub-spaces", icon: Stack },
      { href: "/dashboard/requests/status", label: "Status changes", icon: ArrowsLeftRight },
      { href: "/dashboard/requests/ownership", label: "Ownership", icon: HandArrowUp, keywords: "transfer handover" },
      { href: "/dashboard/requests/ticket-transfers", label: "Ticket transfers", icon: Ticket },
      { href: "/dashboard/requests/free-adds", label: "Free adds", icon: Gift },
      { href: "/dashboard/requests/white-label", label: "White-label", icon: PaintBrush, exact: true, keywords: "branding history" },
      { href: "/dashboard/requests/white-label/apply", label: "Apply branding", icon: MagicWand, keywords: "white-label manage" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/dashboard/financials", label: "Financials", icon: Wallet, keywords: "revenue earnings" },
      { href: "/dashboard/transactions", label: "Transactions", icon: Receipt, keywords: "payments razorpay" },
      { href: "/dashboard/payouts", label: "Payouts", icon: Money },
      { href: "/dashboard/refunds", label: "Refunds", icon: ArrowsClockwise },
      { href: "/dashboard/reconciliation", label: "Reconciliation", icon: Coins },
      { href: "/dashboard/orphaned-payments", label: "Orphaned payments", icon: LinkBreak },
      { href: "/dashboard/bank-accounts", label: "Bank accounts", icon: Bank },
      { href: "/dashboard/subscriptions", label: "Subscriptions", icon: CreditCard, exact: true },
      { href: "/dashboard/plans", label: "Plans", icon: Stack, keywords: "pricing tiers" },
    ],
  },
  {
    label: "Reach",
    items: [
      { href: "/dashboard/notifications", label: "Push", icon: BellRinging, keywords: "notifications onesignal broadcast" },
      { href: "/dashboard/email", label: "Email", icon: EnvelopeSimple, keywords: "campaigns templates" },
      { href: "/dashboard/whatsapp", label: "WhatsApp inbox", icon: WhatsappLogo, exact: true },
      { href: "/dashboard/whatsapp/broadcast", label: "WhatsApp blast", icon: Megaphone },
      { href: "/dashboard/messages", label: "Messages", icon: Tray, keywords: "delivery log failures bounces suppression history" },
      { href: "/dashboard/blog", label: "Blog", icon: Article },
      { href: "/dashboard/careers", label: "Careers", icon: Briefcase, keywords: "jobs hiring" },
    ],
  },
  {
    label: "Trust & support",
    items: [
      { href: "/dashboard/assist", label: "Assist", icon: Lifebuoy, unreadBadge: true, keywords: "support tickets help cases inbox" },
      { href: "/dashboard/content-reports", label: "Content reports", icon: Flag, keywords: "moderation abuse" },
      { href: "/dashboard/help", label: "Help articles", icon: BookOpen, keywords: "knowledge base faq assist" },
      { href: "/dashboard/legal", label: "Legal documents", icon: Gavel, keywords: "terms privacy policy refund agreement consent" },
      { href: "/dashboard/iam", label: "Access control", icon: ShieldCheck, keywords: "iam roles capabilities permissions" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/dashboard/status", label: "Status", icon: Pulse, keywords: "uptime health" },
      { href: "/dashboard/logs", label: "Logs", icon: ListChecks, keywords: "api audit" },
      { href: "/dashboard/app-version", label: "App versions", icon: DeviceMobile, keywords: "store minimum update prompt" },
      { href: "/dashboard/ota", label: "OTA updates", icon: CloudArrowUp, keywords: "eas rollout promote revert expo" },
      { href: "/dashboard/default-images", label: "Default images", icon: ImageSquare, keywords: "banners logos placeholder" },
      { href: "/dashboard/stats-recipients", label: "Stats recipients", icon: ChartLineUp, keywords: "whatsapp daily weekly digest" },
    ],
  },
];

export function isNavActive(pathname: string, item: NavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");
}
