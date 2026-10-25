import type { ComponentType } from "react";
import {
  Article, Bed, Briefcase, CalendarDots, CalendarPlus, ChatCircleDots, CurrencyInr, Database,
  DeviceMobile, DownloadSimple, FileText, Flag, Gavel, HandArrowUp, Handshake, Heart,
  IdentificationCard, Info, Lifebuoy, Link, ListChecks, LockKey, Medal, Megaphone, PlusCircle,
  Prohibit, Question, Receipt, RocketLaunch, ShieldCheck, SquaresFour, Trash, Tray, TreeStructure,
  Trophy, UsersThree, VideoCamera,
} from "@unifesto/unicon/react";

type Glyph = ComponentType<{ size?: number; color?: string; weight?: "regular" | "duotone" }>;

/** Share-card copy for one static page, rendered by app/og/[...path]/route.tsx. */
export type OgPage = { kind: string; title: string; subtitle: string; cta?: string; icon: Glyph };

/**
 * One card per static public page, keyed by the page's canonical path.
 * withSocial() points og:image at /og<path> for any path listed here, so a
 * new page gets its own card by adding one row. Dynamic pages (event, space,
 * blog post, session, help article, certificate) have their own
 * opengraph-image file instead.
 */
export const OG_PAGES: Record<string, OgPage> = {
  // Product
  "/organisers": { kind: "For organisers", title: "Run every event from one Space", subtitle: "Tickets, QR check-in, payouts, certificates and sponsors, with your whole team on board.", cta: "Request a Space", icon: SquaresFour },
  "/pricing": { kind: "Pricing", title: "Free RSVP events on every plan", subtitle: "See what students pay and what you keep on every paid ticket.", cta: "See pricing", icon: CurrencyInr },
  "/huddle": { kind: "Unifesto Huddle", title: "Online sessions for your community", subtitle: "Registration, payment, an in-app room and recordings, run from your Space.", cta: "Host a session", icon: VideoCamera },
  "/sprint": { kind: "Unifesto Sprint", title: "Hackathons, judged properly", subtitle: "Teams, rubrics, judge panels, a help desk and a live leaderboard, in one Space.", cta: "Run a hackathon", icon: Trophy },
  "/stay": { kind: "Unifesto Stay", title: "Rooms for your event's guests", subtitle: "Requests, approvals, payment and a Stay Pass at arrival.", cta: "Add Stay", icon: Bed },
  "/app": { kind: "The app", title: "Your pass, in your pocket", subtitle: "Discover events, register in a few taps and walk in with a QR pass. Free on iOS and Android.", cta: "Get the app", icon: DeviceMobile },
  "/download": { kind: "The app", title: "Get the Unifesto app", subtitle: "Discover events, keep your tickets and follow your communities on the go.", cta: "Download", icon: DownloadSimple },

  // Discover
  "/events": { kind: "Events", title: "Find your next event", subtitle: "Fests, workshops, meetups and hackathons from institutions, clubs, communities and startups.", cta: "Browse events", icon: CalendarDots },
  "/spaces": { kind: "Spaces", title: "Clubs, campuses and communities", subtitle: "Explore the Spaces that run their events on Unifesto.", cta: "Explore Spaces", icon: UsersThree },

  // Get started
  "/request-space": { kind: "Get started", title: "Bring your club to Unifesto", subtitle: "Request a Space for your club, community or institution. We review every one.", cta: "Request a Space", icon: PlusCircle },
  "/request-event": { kind: "Get started", title: "Host one event, no Space needed", subtitle: "Run a single event on Unifesto without setting up a Space.", cta: "Host an event", icon: CalendarPlus },

  // Orbit
  "/orbit": { kind: "Unifesto Orbit", title: "One student per campus", subtitle: "Orbit Leads help every club on their campus run its events on Unifesto.", cta: "Become a Lead", icon: RocketLaunch },
  "/orbit/apply": { kind: "Unifesto Orbit", title: "Lead Orbit on your campus", subtitle: "Apply to be your campus Orbit Lead. We read every application, usually within a week.", cta: "Apply now", icon: HandArrowUp },

  // Company
  "/about": { kind: "About", title: "Built by people who ran the events", subtitle: "Made in Hyderabad, after years of college events run on forms, spreadsheets and group chats.", icon: Heart },
  "/careers": { kind: "Careers", title: "Help us run the whole event", subtitle: "Open roles at Unifesto, building event tools for clubs, communities and institutions.", cta: "See open roles", icon: Briefcase },
  "/press": { kind: "Press", title: "Press & Releases", subtitle: "News, company facts and the Unifesto brand kit.", icon: Megaphone },
  "/blog": { kind: "Blog", title: "Notes from the event floor", subtitle: "Stories, guides and product updates from the Unifesto team.", cta: "Read the blog", icon: Article },
  "/links": { kind: "Links", title: "Everything Unifesto", subtitle: "Start a Space, get the app, read the latest guide.", icon: Link },

  // Help
  "/help": { kind: "Help", title: "How can we help?", subtitle: "Answers to common questions about tickets, check-in, payouts and the app.", icon: Question },
  "/help/contact": { kind: "Help", title: "Talk to a person", subtitle: "Ask Assist, or reach someone on our support team.", icon: ChatCircleDots },
  "/support": { kind: "Support", title: "We're here to help", subtitle: "Search common questions or reach our team on email or WhatsApp.", icon: Lifebuoy },
  "/delete-account": { kind: "Your account", title: "Delete your account", subtitle: "In the app in a minute, or by request if you can't sign in. A 30-day grace period applies.", icon: Trash },

  // Legal
  "/terms": { kind: "Legal", title: "Terms of Service", subtitle: "The terms for using Unifesto as an attendee or organiser.", icon: Gavel },
  "/privacy": { kind: "Legal", title: "Privacy Policy", subtitle: "What we collect, why, who sees it, and your rights under India's DPDP Act.", icon: LockKey },
  "/privacy-notice": { kind: "Legal", title: "Privacy Notice", subtitle: "What we ask for, why, and how to withdraw consent.", icon: Info },
  "/privacy-requests": { kind: "Privacy", title: "Privacy Request Center", subtitle: "Get a copy of your data, correct it, erase it or withdraw consent.", icon: Tray },
  "/data-rights": { kind: "Legal", title: "Your data rights", subtitle: "Your rights under India's DPDP Act, 2023, and how we answer each request.", icon: IdentificationCard },
  "/cookies": { kind: "Legal", title: "Cookie Policy", subtitle: "No advertising or analytics cookies. One essential sign-in cookie.", icon: Database },
  "/refund": { kind: "Legal", title: "Refunds and cancellations", subtitle: "How refunds are requested, reviewed and paid, and what happens when an event is cancelled.", icon: Receipt },
  "/grievance": { kind: "Legal", title: "Grievance Redressal", subtitle: "How to raise a complaint, when you'll hear back and where to escalate.", icon: Flag },
  "/security": { kind: "Security", title: "Responsible Disclosure", subtitle: "Found a vulnerability? How to report it and what's in scope.", icon: ShieldCheck },
  "/acceptable-use": { kind: "Legal", title: "Acceptable Use Policy", subtitle: "What you can and cannot post or do on Unifesto.", icon: Prohibit },
  "/code-of-conduct": { kind: "Community", title: "Code of Conduct", subtitle: "How we expect attendees, organisers, judges, mentors and sponsors to behave.", icon: Handshake },
  "/organiser-agreement": { kind: "Legal", title: "Organiser Agreement", subtitle: "The terms for running a Space: responsibilities, fees, payouts, refunds and attendee data.", icon: FileText },
  "/sponsor-terms": { kind: "Legal", title: "Sponsor and Partner Terms", subtitle: "The terms for sponsors and partners, and how attendee leads may be used.", icon: Medal },
  "/subprocessors": { kind: "Legal", title: "Subprocessor List", subtitle: "The providers that process personal data for us, what for, and where.", icon: TreeStructure },
  "/orbit/terms": { kind: "Legal", title: "Orbit Lead Terms", subtitle: "The programme terms for Unifesto Orbit Leads.", icon: ListChecks },
};
