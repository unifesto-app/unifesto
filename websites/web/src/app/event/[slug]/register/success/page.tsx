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
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black overflow-x-hidden">
      <Navbar />

      <section className="relative bg-black pt-32 pb-20 px-6">
{/* 
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 20%, rgba(52,145,255,0.1) 0%, transparent 70%)" }}
          aria-hidden="true"
        /> */}
        
        <div className="relative z-10 max-w-2xl mx-auto">
          {/* Success Icon */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center animate-bounce" style={{ background: brandGradient }}>
              <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">
              Registration Successful!
            </h1>
            <p className="text-slate-400 text-sm">
              You're all set for {event.title}
            </p>
          </div>

          {/* Registration Details Card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 mb-5">
            {/* QR Code */}
            <div className="text-center mb-5 pb-5 border-b border-white/5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Your Entry Pass
              </p>
              <div className="inline-block p-3 rounded-xl bg-white">
                <img src={qrCodeUrl} alt="QR Code" className="w-40 h-40" />
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Show this QR code at the event entrance
              </p>
            </div>

            {/* Registration ID */}
            <div className="mb-5 pb-5 border-b border-white/5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
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
                <span className="text-slate-500">Event:</span>
                <span className="text-white font-medium text-right">{event.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date:</span>
                <span className="text-white">{event.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Time:</span>
                <span className="text-white">{event.time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Location:</span>
                <span className="text-white text-right">{event.location}</span>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 mb-5">
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
                  <p className="text-sm text-slate-300 pt-0.5">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={`/event/${eventId}`}
              className="flex-1 text-center rounded-full px-6 py-3 text-sm font-semibold border border-white/10 text-white hover:bg-white/5 transition-all"
            >
              Back to Event
            </Link>
            <Link
              href="/events"
              className="flex-1 text-center rounded-full px-6 py-3 text-sm font-bold text-black transition-all duration-300 hover:shadow-[0_0_30px_rgba(52,145,255,0.5)]"
              style={{ background: brandGradient }}
            >
              Explore More Events
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
