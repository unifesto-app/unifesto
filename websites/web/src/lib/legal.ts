/* Legal facts, in one place. Every legal page, the footer and security.txt
   read from here. The processor list mirrors what the code actually sends
   data to (backend env + SDKs, mobile SDKs); update it when a vendor
   changes. Not legal advice: have counsel review before publishing. */

export const LEGAL = {
  company: "Unifesto Private Limited",
  cin: "U63112TS2025PTC208307",
  address:
    "C/O Malla Reddy Education, Sy. No. 640/P and 641/P, Quthbullapur Mandal, Hyderabad, Telangana 500100, India",
  jurisdiction: "Hyderabad, Telangana",
  effective: "6 October 2026",
  grievance: { name: "Vinay Buddolla", email: "grievance@unifesto.app" },
  email: {
    privacy: "privacy@unifesto.app",
    support: "support@unifesto.app",
    legal: "legal@unifesto.app",
    refunds: "refunds@unifesto.app",
    security: "security@unifesto.app",
  },
} as const;

/* Who processes personal data on Unifesto's behalf, and why. */
export const PROCESSORS = [
  { name: "Amazon Web Services", purpose: "Hosting, database, file storage and transactional email (SES)", location: "India (Mumbai region)" },
  { name: "Razorpay", purpose: "Ticket and stay payments, refunds", location: "India" },
  { name: "Meta (WhatsApp Business Platform)", purpose: "Sign-in codes, registration confirmations, group invite links, messages you send us", location: "Global" },
  { name: "Resend", purpose: "Transactional and campaign email", location: "United States" },
  { name: "OneSignal", purpose: "Push notifications", location: "United States" },
  { name: "Google Firebase", purpose: "App analytics and crash reports", location: "Global" },
  { name: "Google and Apple", purpose: "Sign in with Google and Sign in with Apple", location: "Global" },
  { name: "LiveKit", purpose: "Audio and video for live online sessions", location: "Global" },
  { name: "Google Maps Platform", purpose: "Venue search and event maps", location: "Global" },
] as const;
