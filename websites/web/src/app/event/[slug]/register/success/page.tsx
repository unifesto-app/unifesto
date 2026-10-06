"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getEventById } from "@/lib/mockEvents";
import { brandGradient, gradientText } from "@/lib/styles";

interface Props {
  params: Promise<{ id: string }>;
}

export default function RegistrationSuccessPage({ params }: Props) {
  const router = useRouter();
  const [eventId, setEventId] = useState<string>("");
  const [event, setEvent] = useState<any>(null);
  
  // Mock registration data (in real app, this would come from state/API)
  const registrationId = "REG" + Math.random().toString(36).substr(2, 9).toUpperCase();
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${registrationId}`;

  useEffect(() => {
    params.then(({ id }) => {
      setEventId(id);
      const eventData = getEventById(id);
      if (!eventData) {
        router.push("/events");
        return;
      }
      setEvent(eventData);
    });
  }, [params, router]);

  if (!event) {
    return (
      <main className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas overflow-x-hidden">
      <Navbar />

      <section className="relative px-5 pb-24 pt-32 sm:px-8 md:pt-40">
        <div className="relative z-10 max-w-2xl mx-auto">
          {/* Success Icon */}
          <div className="text-center mb-8">
            {/* One-time celebration: the badge pops, a single ring spreads. */}
            <div className="pop relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary" style={{ ["--d" as string]: "120ms" }}>
              <span aria-hidden="true" className="success-ring absolute inset-0 rounded-full" />
              <svg className="w-8 h-8 text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="mb-2 font-display text-3xl font-bold tracking-[-0.035em] text-paper md:text-4xl">
              You&apos;re in.
            </h1>
            <p className="enter text-base text-paper/70" style={{ ["--d" as string]: "260ms" }}>
              You're registered for {event.title}.
            </p>
          </div>

          {/* Registration Details Card */}
          <div className="enter mb-5 rounded-3xl bg-night-2 p-7" style={{ ["--d" as string]: "380ms" }}>
            {/* QR Code */}
            <div className="text-center mb-5 pb-5 border-b border-white/5">
              <p className="text-xs font-semibold text-paper/55 mb-3">
                Your Entry Pass
              </p>
              <div className="inline-block p-3 rounded-xl bg-white">
                <img src={qrCodeUrl} alt="QR Code" className="w-40 h-40" />
              </div>
              <p className="text-xs text-paper/55 mt-3">
                Show this QR code at the event entrance
              </p>
            </div>

            {/* Registration ID */}
            <div className="mb-5 pb-5 border-b border-white/5">
              <p className="text-xs font-semibold text-paper/55 mb-2">
                Registration ID
              </p>
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="text-base font-bold text-white font-mono">{registrationId}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(registrationId)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-all"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Event Details */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-paper/55">Event:</span>
                <span className="text-white font-medium text-right">{event.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-paper/55">Date:</span>
                <span className="text-white">{event.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-paper/55">Time:</span>
                <span className="text-white">{event.time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-paper/55">Location:</span>
                <span className="text-white text-right">{event.location}</span>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="rounded-3xl bg-night-2 p-5 mb-5">
            <h2 className="text-base font-bold text-white mb-3">What's Next?</h2>
            <div className="space-y-2.5">
              {[
                { 
                  icon: (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  ), 
                  text: "Check your email for confirmation" 
                },
                { 
                  icon: (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  ), 
                  text: "Save the QR code or screenshot" 
                },
                { 
                  icon: (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  ), 
                  text: "Add event to your calendar" 
                },
                { 
                  icon: (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ), 
                  text: "Get ready for an amazing experience!" 
                },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-black" style={{ background: brandGradient }}>
                    {item.icon}
                  </div>
                  <p className="text-sm text-paper/75 pt-0.5">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={`/event/${eventId}`}
              className="btn btn-lg btn-secondary flex-1"
            >
              Back to event
            </Link>
            <Link
              href="/events"
              className="btn btn-lg btn-primary flex-1"
            >
              Explore more events
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
