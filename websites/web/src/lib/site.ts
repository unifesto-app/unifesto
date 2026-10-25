/* One source of truth for what the site says about Unifesto. Pages, the
   structured data (JSON-LD) and /llms.txt all read from here, so a fact
   changes in one place and every surface (people, search engines, AI
   assistants) sees the same thing. Every capability listed is shipped and
   was checked against the backend, space app and mobile app code. */

export const SITE = {
  name: "Unifesto",
  legalName: "Unifesto Private Limited",
  url: "https://www.unifesto.app",
  tagline: "Optimize. Organize. Elevate.",
  description:
    "Unifesto is an event platform for clubs, communities, institutions and startups in India. Organisers run ticketing, QR check-in, payouts, certificates, sponsors and hackathon judging from one Space. Attendees discover events, register and carry their pass in the Unifesto app.",
  email: "support@unifesto.app",
  /* Same support line the mobile app's Support screen opens. */
  whatsapp: "919346095136",
  whatsappDisplay: "+91 93460 95136",
  twitter: "@unifestoapp",
  logo: "https://www.unifesto.app/logos/unifesto-icon.png",
  appStore: "https://apps.apple.com/in/app/unifesto-discover-events/id6767165496",
  playStore: "https://play.google.com/store/apps/details?id=com.unifesto.app",
  spaceApp: "https://space.unifesto.app",
} as const;

/* Official profiles. The footer links and the Organization JSON-LD
   `sameAs` both read this, which is how search engines and AI assistants
   tie these accounts to one company. Mobile mirrors these in ProfileScreen (Help and more). */
export const SOCIAL = {
  instagram: "https://www.instagram.com/unifesto.app/",
  linkedin: "https://www.linkedin.com/company/unifesto",
  x: "https://x.com/unifestoapp",
  youtube: "https://www.youtube.com/@unifesto-app",
} as const;

/* Blog authors, keyed by BlogPost.author. Drives the author box under each
   post and the Person in its Article JSON-LD. image and links are the
   author's own (photo URL, personal profiles); leave empty until real. */
export type Author = { role: string; bio: string; image: string | null; links: { label: string; url: string }[] };

export const AUTHORS: Record<string, Author> = {
  "Abhinavtej Reddy": {
    role: "Founder, Unifesto",
    bio: "Builds Unifesto, the event platform that started at Malla Reddy University, Hyderabad.",
    image: null,
    links: [],
  },
};

/* Proof. Keep this honest and dated: these numbers ship in copy and in
   structured data. spacesLive = active Spaces the public API lists
   (GET /spaces?status=ACTIVE, signed out, so private Spaces such as the demo
   one are not counted; sub-spaces are), read on 2026-10-18. Most are
   institution Spaces the team set up; only 2 are verified. The attendee and
   event totals are the founders' figures. */
export const PROOF = {
  spacesLive: 70,
  attendees: "10,000+",
  events: "25+",
  firstCampus: "Malla Reddy University, Hyderabad",
  asOf: "October 2026",
} as const;

/* Press & Releases (/press). Newest first; only things that have shipped.
   Dates are ISO so they sort and render the same everywhere. */
export type Release = { date: string; title: string; body: string };

export const RELEASES: Release[] = [
  {
    date: "2026-10-21",
    title: "Unifesto Orbit, our campus programme for students",
    body: "One Orbit Lead per campus represents Unifesto and helps every club on campus run its events here. Leads earn a certificate, a badge that levels up with their tier, and quarterly goodies. Applications are open at unifesto.app/orbit.",
  },
  {
    date: "2026-10-07",
    title: "A new look for the Unifesto mark",
    body: "The same u and wordmark, now in silver on black to match the product. A new app icon and favicon, and a brand kit for press and partners on this page.",
  },
  {
    date: "2026-10-03",
    title: "Unifesto 4.0 is live on the App Store and Google Play",
    body: "A redesigned app: new Home, Tickets and Profile, light and dark themes, and updates that arrive without a store download.",
  },
];

export const BRAND_KIT = {
  zip: "/press/Unifesto-Brand-Kit.zip",
  guidelines: "/press/Unifesto-Brand-Guidelines.pdf",
} as const;

export type Faq = { q: string; a: string };

/* ── Organiser platform ─────────────────────────────────────────────── */

export type Pillar = {
  id: string;
  title: string;
  lede: string;
  points: string[];
};

export const PILLARS: Pillar[] = [
  {
    id: "spaces",
    title: "A Space for your team",
    lede: "Your club, fest team or institution runs as one Space. Events, people, money and history stay with it, year after year, even when the team changes.",
    points: [
      "Roles that match the work: Space Admin, Curator, Co-Curator and Crew",
      "An editable permission matrix, tuned per Space",
      "Sub-spaces for departments and chapters, with ownership transfer",
      "Co-host an event with another Space, or hand an event over entirely",
    ],
  },
  {
    id: "tickets",
    title: "Tickets for every kind of event",
    lede: "A free club night and a three-day fest use the same builder. Set ticket types, questions and limits once; registration handles the rest.",
    points: [
      "Free RSVP, paid tickets and group tickets with seat claims",
      "Multiple ticket types with capacity, sale windows and hidden tickets",
      "Custom registration questions, including file uploads and show-if logic",
      "Coupons, waitlists with pay-to-claim, recurring series and sub-events",
    ],
  },
  {
    id: "door",
    title: "Check-in that keeps count",
    lede: "Every registration gets a QR pass. Your Crew scans from the Unifesto app at as many points as the event needs, and the count stays honest.",
    points: [
      "Multiple check-in points per event: gates, meals, kits, sessions",
      "Crew access scoped to the points they staff",
      "Group check-in by roster, manual check-in and duplicate guard",
      "Live attendance while the doors are open",
    ],
  },
  {
    id: "money",
    title: "Money, reconciled to the rupee",
    lede: "Collect through Razorpay, pay out to your saved bank account, and see exactly where every rupee went: collected, fees, refunds, net.",
    points: [
      "Razorpay checkout for paid tickets and group seats",
      "Payouts to a verified bank account on the Space",
      "Refunds that need the right approval before money moves",
      "Financials per event and per Space, with CSV exports",
    ],
  },
  {
    id: "reach",
    title: "Reach people where they are",
    lede: "Confirmations land on WhatsApp, reminders arrive as push notifications, and campaigns go out by email. Links tell you which channel worked.",
    points: [
      "WhatsApp confirmations and group or community invite links per ticket",
      "Email campaigns with templates, scheduling, segments and A/B tests",
      "Tracked short links, UTM sources and partner links with attribution",
      "Your Space colour, favicon and email sender with white-label",
    ],
  },
  {
    id: "after",
    title: "After the event",
    lede: "The debrief is already written. Certificates go out in a batch, sponsors get their leads, and a PDF report captures what happened.",
    points: [
      "Certificates from your own template, verifiable by anyone online",
      "Sponsor roster, sponsor portal and booth-scan lead capture",
      "Formatted PDF event reports and attendance analytics",
      "Unifesto Stay: room options, approvals and a Stay Pass scanned at arrival",
    ],
  },
];

/* ── Unifesto Sprint (hackathons) ─────────────────────────────────────────────────────── */

export const HACKATHON_STAGES = [
  {
    title: "Teams and statements",
    body: "Participants register as teams, pick a problem statement or theme, and manage their roster from the app.",
  },
  {
    title: "Rounds and rubrics",
    body: "Define rounds with weighted criteria. Assign judges to panels and send teams for evaluation round by round.",
  },
  {
    title: "Rooms and the help desk",
    body: "Map teams to rooms with volunteers. Teams raise queries by topic and the right point of contact picks them up.",
  },
  {
    title: "Submissions and updates",
    body: "Teams submit their work in the app. Announcements reach every participant as a push notification.",
  },
  {
    title: "Results and certificates",
    body: "Scores roll into a live leaderboard, winners and awards are published, and certificates go out to every team.",
  },
] as const;

/* ── Unifesto Stay (event accommodation) ────────────────────────────── */
/* Checked against backend/src/stays + the Stay* models: stays per event,
   room options with beds/gender/price/payment mode, custom questions,
   per-guest photo ID, team approval, payment window, allocation, and a
   Stay Pass scanned at arrival. Not plan-gated. */

export const STAY_STEPS = [
  { title: "Register for the event", body: "Stays open to registered attendees only, so every bed goes to someone actually coming." },
  { title: "Request a room", body: "Pick a room option and dates, add your group, upload each guest's photo ID and answer the team's questions." },
  { title: "Team approves", body: "The event team reviews the request, assigns a room or bed, and approves. Beds are held only from here." },
  { title: "Pay if needed", body: "Free stays confirm at once. Online stays are paid in the app within the payment window; others pay at the property." },
  { title: "Show the Stay Pass", body: "The pass appears in the app. The team scans it at arrival to check you in, and again when you leave." },
] as const;

export const FAQ_STAY: Faq[] = [
  {
    q: "What is Unifesto Stay?",
    a: "Unifesto Stay is accommodation booking built into Unifesto events. Organisers list hostels, hotels or homestays for their event; registered attendees request a room in the Unifesto app, the team approves it, and the guest checks in with a Stay Pass.",
  },
  {
    q: "Who can book a stay?",
    a: "Only people registered for the event. Each person can hold one open stay booking per event, and can book for a group up to the size the room option allows.",
  },
  {
    q: "How is payment handled?",
    a: "Each room option is free, paid at the property, or paid online through Razorpay. Online bookings are paid after approval, within a payment window (48 hours by default); unpaid beds are released.",
  },
  {
    q: "Why does Unifesto ask for a photo ID?",
    a: "Event teams usually need ID for every guest staying on campus or at a property. IDs are uploaded with the request, kept in private storage and visible only to the event team. Organisers can turn the requirement off.",
  },
  {
    q: "Can organisers separate rooms by gender?",
    a: "Yes. Each room option can be open to anyone, men only or women only, and every guest's gender is recorded with the request.",
  },
];

/* ── Unifesto Huddle (online sessions) ────────────────────────────────── */
/* Checked against backend/src/sessions: Space-owned online sessions, one
   price (0 = free), hosted in-app on LiveKit or on Meet/Zoom/Teams, join
   gated to paid registrants from 15 min before start, T-24h and T-15m
   reminders, co-hosts, interactive or broadcast, recording, cancel-refunds.
   Plan-gated (hasSessions, Pro). */

export const HUDDLE_STEPS = [
  { title: "Find the session", body: "Sessions show up on the Space's page and in the app, with the host, time and price." },
  { title: "Register or pay", body: "Free sessions confirm in a tap. Paid ones take a single payment through Razorpay." },
  { title: "Get reminded", body: "A reminder a day before and again 15 minutes before start, with a link straight to the session." },
  { title: "Join in the app", body: "The Join button opens 15 minutes before start. There is no link to forward, only your own seat." },
  { title: "Catch the recording", body: "If the host records, the recording is added to the session afterwards." },
] as const;

export const FAQ_HUDDLE: Faq[] = [
  {
    q: "What is Unifesto Huddle?",
    a: "Unifesto Huddle is online sessions for Spaces: talks, workshops, AMAs and office hours. Hosts schedule a session, attendees register or pay in the Unifesto app, and everyone joins a video room inside Unifesto, or on Google Meet, Zoom or Teams if the host prefers.",
  },
  {
    q: "How is it different from an event?",
    a: "Events are in person, with tickets, QR passes and check-in. A session is online only and deliberately simpler: one price, no ticket tiers or forms, and attendance is recorded when someone joins.",
  },
  {
    q: "Can people share the joining link?",
    a: "Not for sessions hosted in Unifesto. Each attendee gets a personal pass into the room that expires, so there is no link to forward, and one account can only be in the room once at a time.",
  },
  {
    q: "What happens if a session is cancelled?",
    a: "Everyone who paid is queued for a refund automatically. Attendees do not have to ask.",
  },
  {
    q: "Which plan includes it?",
    a: "Unifesto Huddle is part of the Pro plan. Free sessions carry no fee; paid sessions use the same platform fee as tickets.",
  },
];

/* ── Unifesto Orbit (campus programme) ─────────────────────────────────── */
/* One Orbit Lead per campus. Rewards are recognition, not cash. The tier
   thresholds and rewards here are the programme's, set by the founder. */

export const ORBIT_APPLY = "/orbit/apply";

export const ORBIT_STEPS = [
  { title: "Map", body: "Make a list of every club on your campus." },
  { title: "Onboard", body: "Each club creates its Space on Unifesto and joins your campus." },
  { title: "Activate", body: "The club publishes its first event. That makes it an active club." },
  { title: "Support", body: "Be the first help for organisers on your campus." },
] as const;

export const ORBIT_TIERS = [
  { name: "Lead", bar: "Pass the first 30 days", rewards: ["Orbit certificate", "Orbit badge", "The Lead welcome kit"] },
  { name: "Bronze", bar: "5 active clubs", rewards: ["Letter of recommendation signed by the founder", "A feature on Unifesto's socials"] },
  { name: "Silver", bar: "10 active clubs and 1 paid event", rewards: ["Free Pro plan for your own club", "A limited-edition hoodie every quarter"] },
  { name: "Gold", bar: "15 active clubs, or bring your fest onto Unifesto", rewards: ["Fast-track interview for a paid internship", "A shot at Orbit Lead of the Year", "A limited-edition hoodie every quarter"] },
] as const;

/* Orbit welcome kits. Lead: shipped when a Lead passes their first 30 days.
   Crew: a lighter kit for the 2 to 3 crew on big campuses. */
export const ORBIT_WELCOME_KIT = {
  lead: {
    label: "Lead edition",
    lede: "Pass your first 30 days and a box lands at your door.",
    items: [
      { name: "Orbit hoodie", body: "With the Orbit mark on the chest." },
      { name: "The Orbit Playbook", body: "Pitches, scripts and your first 30 days, in one book." },
      { name: "Welcome letter", body: "A signed note from our founder." },
      { name: "Sticker pack", body: "For your laptop, bottle and club notice board." },
      { name: "Pins, phone grip, keychain", body: "The small stuff, in Orbit colours." },
    ],
  },
  crew: {
    label: "Crew edition",
    lede: "On big campuses, the Lead's crew gets a kit of their own once their Lead passes the first 30 days.",
    items: [
      { name: "Orbit tee", body: "With the Orbit mark on the chest." },
      { name: "Welcome letter", body: "A signed note from our founder." },
      { name: "Sticker pack", body: "For your laptop, bottle and club notice board." },
      { name: "Pins and keychain", body: "The small stuff, in Orbit colours." },
    ],
  },
} as const;

/* Quarterly goodies: shipped after each quarter closes (Mar, Jun, Sep, Dec). */
export const ORBIT_QUARTERLY = {
  title: "Goodies every quarter",
  points: [
    "Every active Lead: a sticker and lanyard pack",
    "Silver and Gold: that quarter's limited-edition hoodie, a new design each time",
    "Shipped after March, June, September and December",
  ],
  note: "Active means you have passed your first 30 days and added a club or event in the last 60 days.",
} as const;

/* What Orbit Crew get: they help a Lead on a big campus, with no tier of their own. */
export const ORBIT_CREW_EARN = {
  title: "Orbit Crew",
  points: [
    "The Crew welcome kit, once your Lead passes the first 30 days",
    "An Orbit certificate",
    "No targets or tiers of your own: you help your Lead",
  ],
  note: "Crew join on big campuses, 2 to 3 per campus, chosen with the Lead.",
} as const;

export const ORBIT_RULES = [
  "Never say you represent your college. You represent Unifesto.",
  "Never collect money outside Unifesto.",
  "No fake clubs or events.",
  "No spam.",
  "When you post about Unifesto, say you are an Orbit Lead and tag #UnifestoOrbit.",
] as const;

export const FAQ_ORBIT: Faq[] = [
  {
    q: "Is this paid?",
    a: "No. Orbit rewards are recognition, not cash. Top Leads get a fast-track interview for a paid internship.",
  },
  {
    q: "Do I need to be in a club?",
    a: "Yes. You should be active in a club or fest team on your campus. That is where the work starts.",
  },
  {
    q: "Can two people from one college apply?",
    a: "There is one Orbit Lead per campus. Big campuses can have 2 to 3 crew members working under the Lead.",
  },
  {
    q: "What if my college is not on Unifesto yet?",
    a: "Apply anyway. We create the campus Space.",
  },
  {
    q: "What happens during exams?",
    a: "Take a break. Tell your Program Lead before you go and pick up again after.",
  },
  {
    q: "How much time does it take?",
    a: "There are no fixed hours and it is fully remote. In the first 30 days the goal is 2 clubs onboarded. After that there is no end date: you stay as long as you are active.",
  },
];

/* ── Attendee app ───────────────────────────────────────────────────── */

export const APP_FEATURES = [
  {
    id: "discover",
    title: "Find what is on",
    body: "A feed of events near you, by category and by date. Save the ones you like and follow the Spaces you care about.",
  },
  {
    id: "register",
    title: "Register in a few taps",
    body: "RSVP or pay with Razorpay, apply a coupon, join a waitlist or buy seats for your whole team and invite them by link.",
  },
  {
    id: "pass",
    title: "Your pass, always ready",
    body: "Every ticket lives in the Tickets tab with its QR code. Add it to your calendar, share that you are going, join the WhatsApp group.",
  },
  {
    id: "more",
    title: "Everything around the event",
    body: "Book a stay, join a live online session, follow your hackathon team, and keep every certificate you earn in one place.",
  },
] as const;

/* ── Pricing ────────────────────────────────────────────────────────── */

/* Launch pricing, shown as a discount off the standard price. Indian
   ticketing platforms typically charge 4% to 6% per paid ticket; Unifesto
   undercuts that on every plan. The fees here are only a fallback: /pricing
   shows the live platform fee per plan from the backend rate card
   (GET /config/plan-fees, lib/api/rate-card.ts). Prices and copy stay here. */
export const LAUNCH_OFFER_ENDS = "31 March 2027";

export type Plan = {
  id: "starter" | "pro" | "enterprise";
  name: string;
  forWho: string;
  /** Monthly price in rupees; null = custom quote. */
  price: number | null;
  standardPrice: number | null;
  annualMonthly: number | null;
  /** Platform fee per paid ticket, percent. Fallback; live value from the rate card. */
  fee: number;
  standardFee: number;
  includes: string[];
  cta: { label: string; href: string };
};

/** Processing fee the BUYER pays at checkout on every paid ticket, percent of
   the ticket price, on every plan. Separate from the organiser's platform fee
   above. Must match PROCESSING_FEE_PERCENT in
   backend/src/subscription/platform-config.service.ts. */
export const BUYER_PROCESSING_FEE = 5;
/** Most the buyer fee can be per ticket, in rupees (A34). Fallback; live value from the rate card. */
export const BUYER_PROCESSING_FEE_CAP = 99;

/** "5% processing fee, capped at ₹99 per ticket". */
export const buyerFeeText = (percent: number = BUYER_PROCESSING_FEE, cap: number | null = BUYER_PROCESSING_FEE_CAP) =>
  `${percent}% processing fee${cap ? `, capped at ₹${cap} per ticket` : ""}`;

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    forWho: "Clubs and communities getting going",
    price: 0,
    standardPrice: 0,
    annualMonthly: 0,
    fee: 2.5,
    standardFee: 4,
    includes: [
      "Unlimited free RSVP events, no platform fee",
      "Paid and group tickets with Razorpay",
      "Multi-point QR check-in from the app",
      "Coupons, custom questions, sub-events",
      "Payouts, refunds and financials",
      "WhatsApp confirmations and push",
      "Unifesto Stay: rooms, approvals, stay passes",
    ],
    cta: { label: "Start free", href: "/request-space" },
  },
  {
    id: "pro",
    name: "Pro",
    forWho: "Fest teams and Spaces that run every month",
    price: 1499,
    standardPrice: 2999,
    annualMonthly: 1199,
    fee: 1.5,
    standardFee: 3,
    includes: [
      "Everything in Starter",
      "Waitlists and recurring event series",
      "Certificates with public verification",
      "Sponsors, sponsor portal and lead capture",
      "Unifesto Sprint for hackathons",
      "Unifesto Huddle online sessions",
      "WhatsApp blasts, analytics and PDF reports",
      "Bulk attendee export",
    ],
    cta: { label: "Start with Pro", href: "/request-space" },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    forWho: "Institutions running many Spaces",
    price: null,
    standardPrice: null,
    annualMonthly: null,
    fee: 1,
    standardFee: 2,
    includes: [
      "Everything in Pro",
      "White-label: colour, favicon, email sender",
      "Remove Unifesto branding",
      "Sub-spaces for every department",
      "Custom limits and priority support",
      "Onboarding for your team",
    ],
    cta: { label: "Talk to us", href: "mailto:support@unifesto.app?subject=Unifesto%20Enterprise" },
  },
];

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Format dates in one fixed zone: the server renders in UTC, browsers in their own (K16). */
export const IST = "Asia/Kolkata";
/** Rupees to the paise, dropping a trailing .00 (₹12.50, ₹0). */
const rupees = (n: number) => `₹${n.toFixed(2).replace(/\.00$/, "")}`;

/* ── FAQs (rendered visibly and as FAQPage structured data) ─────────── */

export const FAQ_HOME: Faq[] = [
  {
    q: "What is Unifesto?",
    a: "Unifesto is an event platform built in India for clubs, communities, institutions and startups. Organisers create a Space for their team and run ticketing, QR check-in, payouts, certificates, sponsors and hackathons from it. Attendees use the free Unifesto app on iOS and Android to discover events, register and carry their passes.",
  },
  {
    q: "Is Unifesto free to use?",
    a: `Yes. Free RSVP events cost nothing on any plan. On paid tickets the Starter plan charges the organiser a 2.5% platform fee at launch pricing, lower than the 4% to 6% most Indian ticketing platforms charge. Pro and Enterprise lower the fee further. At checkout, buyers pay a ${buyerFeeText()}.`,
  },
  {
    q: "How does check-in work?",
    a: "Every registration gets a QR pass in the Unifesto app and by email. Crew members scan passes from the app at one or more check-in points, such as the main gate, lunch and kit collection. Group tickets can be checked in by roster, and duplicate scans are flagged.",
  },
  {
    q: "Can Unifesto run a hackathon?",
    a: "Yes, with Unifesto Sprint. It handles hackathon teams, problem statements, rounds with weighted rubrics, judge panels, rooms with volunteers, a help desk, submissions, a live leaderboard, results and certificates.",
  },
  {
    q: "How do organisers get paid?",
    a: "Attendees pay through Razorpay. Organisers add a bank account to their Space and receive payouts to it. The financials view shows collected amounts, fees, refunds and the net payout for every event.",
  },
];

export const FAQ_ORGANISERS: Faq[] = [
  {
    q: "How do I start hosting on Unifesto?",
    a: "Request a Space with your club, community or institution name. Once it is approved you can add your team, create your first event and publish it.",
  },
  {
    q: "Can my whole team work on one event?",
    a: "Yes. Add members to your Space as Curators, Co-Curators or Crew. Each role has its own permissions, and Space Admins can tune the permission matrix for their Space.",
  },
  {
    q: "Do I need a website or a separate form tool?",
    a: "No. Every event gets a public page on unifesto.app with registration, tickets, custom questions and payments built in. You can share it as a tracked short link.",
  },
  {
    q: "Can I run events from my phone?",
    a: "Yes. The Unifesto app includes event management: attendees, tickets, coupons, check-in scanning, WhatsApp links, sponsors, stays and payouts. The full console is also available at space.unifesto.app.",
  },
  {
    q: "What happens when someone asks for a refund?",
    a: "The attendee requests a refund from the app. It goes to the event's Curator and then to an admin for approval before any money moves, so refunds are never issued by accident.",
  },
];

export const FAQ_APP: Faq[] = [
  {
    q: "Is the Unifesto app free?",
    a: "Yes. The Unifesto app is free on the App Store and Google Play. You only pay for paid event tickets, through Razorpay.",
  },
  {
    q: "Do I need the app to attend an event?",
    a: "No, your pass is also emailed to you. The app keeps every pass in one place, works at the gate in one tap, and adds reminders, calendar entries and WhatsApp group links.",
  },
  {
    q: "Can I register my friends or my team?",
    a: "Yes. Buy a group ticket, then invite each member by link. They claim their seat in the app and get their own pass.",
  },
  {
    q: "Where do my certificates go?",
    a: "Certificates you earn appear in the Certificates screen in the app. Each one has a public verification link you can share on LinkedIn or with an employer.",
  },
];

export const FAQ_HACKATHONS: Faq[] = [
  {
    q: "How are hackathon submissions judged on Unifesto?",
    a: "Organisers define rounds and weighted criteria. Judges are grouped into panels and score each team from the Unifesto app. Scores roll into a leaderboard that organisers publish when ready.",
  },
  {
    q: "Can participants ask for help during the hackathon?",
    a: "Yes. Teams raise a query by topic from the app. It reaches the point of contact for that topic and the volunteers assigned to the team's room. Anything else goes to the organisers.",
  },
  {
    q: "Do hackathon teams get certificates?",
    a: "Yes. Organisers issue certificates to participants and winners from their own template. Each certificate can be verified publicly online.",
  },
];

/** Pricing FAQs, worded from the live rate card (see lib/api/rate-card.ts). */
export const pricingFaq = (
  plans: Plan[] = PLANS,
  buyerFee: number = BUYER_PROCESSING_FEE,
  buyerFeeCap: number | null = BUYER_PROCESSING_FEE_CAP,
): Faq[] => [
  {
    q: "What does launch pricing mean?",
    a: `Spaces that join before ${LAUNCH_OFFER_ENDS} lock in the discounted monthly price and platform fee shown on this page.`,
  },
  {
    q: "Are free events really free?",
    a: "Yes. Free RSVP events carry no platform fee on any plan.",
  },
  {
    q: "Who pays the processing fee?",
    a: `The buyer. Every paid ticket carries a ${buyerFeeText(buyerFee, buyerFeeCap)}, added at checkout on every plan and not refundable. Your platform fee is separate: ${plans.map((p) => `${p.fee}% on ${p.name}`).join(", ")}. On a ₹500 Starter ticket the buyer pays ${inr(500 * (1 + buyerFee / 100))} and you pay ${rupees(500 * (plans[0]?.fee ?? 0) / 100)}.`,
  },
  {
    q: "Are payment gateway charges included?",
    a: "No. Razorpay's payment gateway charges are separate from the Unifesto platform fee. All prices exclude 18% GST.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. Plans are set per Space and you can move up or down at any time from Billing in the Space console.",
  },
];
