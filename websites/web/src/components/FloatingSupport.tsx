"use client";

import { useEffect, useState } from "react";
import { ChatCircleDots, EnvelopeSimple, Lifebuoy, WhatsappLogo, X } from "@phosphor-icons/react";
import { useLightSurfaceAt } from "@/lib/surface";
import { SITE } from "@/lib/site";
import { SupportRow, supportMailto, whatsappHref } from "@/components/support";

/* Help button: same real channels as the mobile Support screen.
   WhatsApp is the live chat; nothing here is simulated. */
export default function FloatingSupport() {
  const [open, setOpen] = useState(false);
  const onLight = useLightSurfaceAt(() => [window.innerWidth - 52, window.innerHeight - 52]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />}

      <div className={`fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6 ${onLight ? "on-light" : ""}`}>
        {open && (
          <div
            role="dialog"
            aria-label="Contact support"
            className="support-pop absolute bottom-full right-0 mb-3 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-night-2 shadow-[0_20px_60px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
          >
            <div className="px-4 pb-2 pt-4">
              <p className="text-base font-semibold text-paper">How can we help?</p>
              <p className="mt-0.5 text-sm text-paper/55">We reply within 24 hours.</p>
            </div>
            <div className="divide-y divide-white/[0.06]">
              <SupportRow
                icon={<WhatsappLogo weight="fill" className="h-7 w-7 text-[#25D366]" />}
                label="Chat on WhatsApp"
                value={SITE.whatsappDisplay}
                href={whatsappHref}
              />
              <SupportRow
                icon={<EnvelopeSimple weight="fill" className="h-7 w-7 text-primary" />}
                label="Email"
                value={SITE.email}
                href={`mailto:${SITE.email}`}
                onClickHref={supportMailto}
              />
              <SupportRow
                icon={<Lifebuoy className="h-7 w-7 text-paper/60" />}
                label="Help center"
                value="Common questions"
                href="/support"
              />
            </div>
          </div>
        )}

        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Close support" : "Contact support"}
          className="support-bubble btn-primary flex h-14 w-14 items-center justify-center rounded-full text-primary-foreground shadow-[0_12px_28px_-10px_rgb(var(--glow)/0.6)] transition-[background-color,transform] duration-150 active:scale-[0.97]"
        >
          {open ? <X weight="bold" className="h-6 w-6" /> : <ChatCircleDots weight="fill" className="h-7 w-7" />}
        </button>
      </div>

      <style jsx>{`
        .support-pop {
          animation: support-pop 0.2s cubic-bezier(0.22, 1, 0.36, 1);
          transform-origin: bottom right;
        }
        @keyframes support-pop {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.97);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .support-pop {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
