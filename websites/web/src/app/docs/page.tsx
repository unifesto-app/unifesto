"use client";

import { useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  Lightning,
  BookOpen,
  Lock,
  CalendarDots,
  WebhooksLogo,
  Package,
  MagnifyingGlass,
  WarningCircle,
} from "@phosphor-icons/react";

type DocSection = "getting-started" | "api" | "authentication" | "events" | "webhooks" | "sdks";

const SECTIONS: { id: DocSection; label: string; Icon: typeof Lightning }[] = [
  { id: "getting-started", label: "Getting Started", Icon: Lightning },
  { id: "api", label: "API Reference", Icon: BookOpen },
  { id: "authentication", label: "Authentication", Icon: Lock },
  { id: "events", label: "Events API", Icon: CalendarDots },
  { id: "webhooks", label: "Webhooks", Icon: WebhooksLogo },
  { id: "sdks", label: "SDKs & Libraries", Icon: Package },
];

const CODE_PANEL = "rounded-xl border border-white/10 bg-[#050507] p-4";

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className={CODE_PANEL}>
      <pre className="text-sm text-slate-200 overflow-x-auto">{children}</pre>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-primary bg-primary/12 border border-primary/25 flex-shrink-0">
        {n}
      </div>
      <div>
        <h4 className="text-base font-semibold text-white mb-1">{title}</h4>
        <p className="text-sm text-slate-300">{desc}</p>
      </div>
    </div>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<DocSection>("getting-started");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SECTIONS;
    const matches = SECTIONS.filter((s) => s.label.toLowerCase().includes(q));
    return matches.length > 0 ? matches : SECTIONS;
  }, [searchQuery]);

  return (
    <main className="min-h-screen bg-[#050507] overflow-x-hidden text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden pt-28 pb-12 px-6 border-b border-white/5">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-72 w-[36rem] rounded-full bg-primary/12 blur-[130px]"
        />
        <div className="relative max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-[-0.02em] leading-tight mb-4">
              Build with Unifesto
            </h1>
            <p className="text-slate-300 text-lg max-w-2xl mx-auto">
              Everything you need to integrate Unifesto into your applications. APIs, SDKs, and guides.
            </p>
          </div>

          {/* Search */}
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <input
                type="text"
                placeholder="Search documentation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-full px-6 py-4 pl-12 text-sm text-white placeholder-slate-400 outline-none focus:border-primary transition-colors"
              />
              <MagnifyingGlass
                size={20}
                weight="bold"
                className="text-slate-400 absolute left-4 top-1/2 -translate-y-1/2"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-10">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav className="space-y-2">
              {filteredSections.map(({ id, label, Icon }) => {
                const active = activeSection === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveSection(id)}
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors duration-200 flex items-center gap-3 ${
                      active
                        ? "bg-white/5 text-white border border-white/10"
                        : "text-slate-300 hover:text-white hover:bg-white/[0.03] border border-transparent"
                    }`}
                  >
                    <Icon size={20} weight="bold" className={active ? "text-primary" : "text-slate-400"} />
                    {label}
                  </button>
                );
              })}
            </nav>

            {/* Quick Links */}
            <div className="mt-8 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Quick Links</p>
              <div className="space-y-2">
                <a href="#" className="block text-sm text-slate-300 hover:text-white transition-colors">
                  API Status
                </a>
                <a href="#" className="block text-sm text-slate-300 hover:text-white transition-colors">
                  Changelog
                </a>
                <a href="/support" className="block text-sm text-slate-300 hover:text-white transition-colors">
                  Support
                </a>
                <a href="#" className="block text-sm text-slate-300 hover:text-white transition-colors">
                  GitHub
                </a>
              </div>
            </div>
          </aside>

          {/* Content Area */}
          <div className="min-h-screen">
            {/* Getting Started */}
            {activeSection === "getting-started" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl font-extrabold text-white tracking-[-0.02em] mb-4">Getting Started</h2>
                  <p className="text-slate-300 leading-relaxed">
                    Welcome to the Unifesto API documentation. This guide will help you integrate our platform into your applications.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                  <h3 className="text-xl font-bold text-white mb-4">Quick Start</h3>
                  <div className="space-y-4">
                    <Step n={1} title="Create an Account" desc="Sign up for a developer account at unifesto.app/auth" />
                    <Step n={2} title="Get API Keys" desc="Navigate to Settings → API Keys to generate your credentials" />
                    <Step n={3} title="Make Your First Request" desc="Use your API key to authenticate and start building" />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#050507] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-white">Example Request</h4>
                    <button className="text-xs font-medium text-slate-300 hover:text-white transition-colors">
                      Copy
                    </button>
                  </div>
                  <pre className="text-sm text-slate-200 overflow-x-auto">
{`curl https://api.unifesto.app/v1/events \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}
                  </pre>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                    <h4 className="text-base font-bold text-white mb-2">Base URL</h4>
                    <code className="text-sm text-slate-300">https://api.unifesto.app/v1</code>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                    <h4 className="text-base font-bold text-white mb-2">Rate Limits</h4>
                    <p className="text-sm text-slate-300">1000 requests per hour</p>
                  </div>
                </div>
              </div>
            )}

            {/* API Reference */}
            {activeSection === "api" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl font-extrabold text-white tracking-[-0.02em] mb-4">API Reference</h2>
                  <p className="text-slate-300 leading-relaxed">Complete reference for all Unifesto API endpoints.</p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-white">Events</h3>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    <div className="p-6 border-b border-white/5">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-1 rounded text-xs font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                          GET
                        </span>
                        <code className="text-sm text-white">/events</code>
                      </div>
                      <p className="text-sm text-slate-300">List all events</p>
                    </div>
                    <div className="p-6 bg-[#050507]">
                      <pre className="text-sm text-slate-200 overflow-x-auto">
{`{
  "data": [
    {
      "id": "evt_123",
      "title": "Tech Summit 2026",
      "date": "2026-03-15",
      "location": "Main Auditorium",
      "price": 0,
      "spotsLeft": 150
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45
  }
}`}
                      </pre>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    <div className="p-6 border-b border-white/5">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-1 rounded text-xs font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                          GET
                        </span>
                        <code className="text-sm text-white">/events/:id</code>
                      </div>
                      <p className="text-sm text-slate-300">Get event details</p>
                    </div>
                    <div className="p-6 bg-[#050507]">
                      <pre className="text-sm text-slate-200 overflow-x-auto">
{`{
  "data": {
    "id": "evt_123",
    "title": "Tech Summit 2026",
    "description": "Annual tech conference...",
    "date": "2026-03-15",
    "time": "10:00 AM - 6:00 PM",
    "location": "Main Auditorium",
    "organizer": "Tech Club",
    "price": 0,
    "spotsLeft": 150,
    "totalSpots": 500
  }
}`}
                      </pre>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    <div className="p-6 border-b border-white/5">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-1 rounded text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          POST
                        </span>
                        <code className="text-sm text-white">/events</code>
                      </div>
                      <p className="text-sm text-slate-300">Create a new event</p>
                    </div>
                    <div className="p-6 bg-[#050507]">
                      <pre className="text-sm text-slate-200 overflow-x-auto">
{`{
  "title": "New Event",
  "description": "Event description",
  "date": "2026-04-20",
  "time": "2:00 PM",
  "location": "Room 101",
  "price": 0,
  "totalSpots": 100
}`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Authentication */}
            {activeSection === "authentication" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl font-extrabold text-white tracking-[-0.02em] mb-4">Authentication</h2>
                  <p className="text-slate-300 leading-relaxed">
                    Unifesto uses API keys to authenticate requests. Include your API key in the Authorization header.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                  <h3 className="text-xl font-bold text-white mb-4">API Key Authentication</h3>
                  <p className="text-sm text-slate-300 mb-4">
                    All API requests must include your API key in the Authorization header:
                  </p>
                  <CodeBlock>{`Authorization: Bearer YOUR_API_KEY`}</CodeBlock>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                  <h3 className="text-xl font-bold text-white mb-4">OAuth 2.0</h3>
                  <p className="text-sm text-slate-300 mb-4">
                    For user-facing applications, use OAuth 2.0 for secure authentication:
                  </p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-white mb-1">Authorization URL</p>
                      <code className="text-sm text-slate-300">https://unifesto.app/oauth/authorize</code>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white mb-1">Token URL</p>
                      <code className="text-sm text-slate-300">https://api.unifesto.app/oauth/token</code>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/5 p-6">
                  <div className="flex items-start gap-3">
                    <WarningCircle size={20} weight="fill" className="text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-yellow-400 mb-1">Security Best Practices</p>
                      <p className="text-sm text-slate-300">
                        Never expose your API keys in client-side code. Always make API calls from your backend server.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Events API */}
            {activeSection === "events" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl font-extrabold text-white tracking-[-0.02em] mb-4">Events API</h2>
                  <p className="text-slate-300 leading-relaxed">
                    Manage events, registrations, and attendees programmatically.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                    <h3 className="text-lg font-bold text-white mb-3">Query Parameters</h3>
                    <div className="space-y-3">
                      {[
                        { param: "category", type: "string", desc: "Filter by event category" },
                        { param: "status", type: "string", desc: "Filter by status (upcoming, past, featured)" },
                        { param: "price", type: "string", desc: "Filter by price (free, paid)" },
                        { param: "page", type: "number", desc: "Page number for pagination" },
                        { param: "limit", type: "number", desc: "Number of results per page (max 100)" },
                      ].map((item) => (
                        <div key={item.param} className="flex items-start gap-4 pb-3 border-b border-white/5 last:border-0">
                          <code className="text-sm font-mono text-white bg-white/5 px-2 py-1 rounded">{item.param}</code>
                          <div className="flex-1">
                            <p className="text-xs text-slate-400 mb-1">{item.type}</p>
                            <p className="text-sm text-slate-300">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                    <h3 className="text-lg font-bold text-white mb-3">Event Registration</h3>
                    <p className="text-sm text-slate-300 mb-4">Register a user for an event:</p>
                    <CodeBlock>
{`POST /events/:id/register

{
  "userId": "usr_123",
  "email": "user@example.com",
  "name": "John Doe"
}`}
                    </CodeBlock>
                  </div>
                </div>
              </div>
            )}

            {/* Webhooks */}
            {activeSection === "webhooks" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl font-extrabold text-white tracking-[-0.02em] mb-4">Webhooks</h2>
                  <p className="text-slate-300 leading-relaxed">
                    Receive real-time notifications when events occur in your Unifesto account.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                  <h3 className="text-xl font-bold text-white mb-4">Available Events</h3>
                  <div className="space-y-3">
                    {[
                      { event: "event.created", desc: "Triggered when a new event is created" },
                      { event: "event.updated", desc: "Triggered when an event is updated" },
                      { event: "registration.created", desc: "Triggered when someone registers for an event" },
                      { event: "registration.cancelled", desc: "Triggered when a registration is cancelled" },
                      { event: "ticket.scanned", desc: "Triggered when a ticket QR code is scanned" },
                    ].map((item) => (
                      <div key={item.event} className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
                        <code className="text-sm font-mono text-white">{item.event}</code>
                        <p className="text-sm text-slate-300 mt-1">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                  <h3 className="text-xl font-bold text-white mb-4">Webhook Payload</h3>
                  <CodeBlock>
{`{
  "id": "evt_webhook_123",
  "type": "event.created",
  "created": 1234567890,
  "data": {
    "object": {
      "id": "evt_123",
      "title": "New Event",
      "date": "2026-04-20"
    }
  }
}`}
                  </CodeBlock>
                </div>
              </div>
            )}

            {/* SDKs */}
            {activeSection === "sdks" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl font-extrabold text-white tracking-[-0.02em] mb-4">SDKs & Libraries</h2>
                  <p className="text-slate-300 leading-relaxed">
                    Official SDKs and community libraries to integrate Unifesto in your preferred language.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { name: "JavaScript / TypeScript", status: "Official", install: "npm install @unifesto/sdk" },
                    { name: "Python", status: "Official", install: "pip install unifesto" },
                    { name: "Ruby", status: "Community", install: "gem install unifesto" },
                    { name: "PHP", status: "Community", install: "composer require unifesto/sdk" },
                    { name: "Go", status: "Official", install: "go get github.com/unifesto/go-sdk" },
                    { name: "Java", status: "Community", install: "Maven/Gradle available" },
                  ].map((sdk) => (
                    <div key={sdk.name} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-base font-bold text-white">{sdk.name}</h4>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            sdk.status === "Official"
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          }`}
                        >
                          {sdk.status}
                        </span>
                      </div>
                      <code className="text-xs text-slate-300 bg-[#050507] px-3 py-2 rounded block">{sdk.install}</code>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                  <h3 className="text-xl font-bold text-white mb-4">Quick Example (Node.js)</h3>
                  <CodeBlock>
{`const Unifesto = require('@unifesto/sdk');

const client = new Unifesto({
  apiKey: 'YOUR_API_KEY'
});

// List all events
const events = await client.events.list({
  category: 'Hackathon',
  status: 'upcoming'
});

// Create an event
const event = await client.events.create({
  title: 'My Event',
  date: '2026-05-01',
  location: 'Main Hall'
});`}
                  </CodeBlock>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
