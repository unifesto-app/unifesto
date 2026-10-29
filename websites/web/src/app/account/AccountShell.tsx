"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SignIn from "@/components/SignIn";
import { clearSession, useWebSession } from "@/lib/auth";

const TABS = [
  { href: "/account", label: "Profile" },
  { href: "/account/notifications", label: "Notifications" },
  { href: "/account/saved", label: "Saved events" },
  { href: "/account/certificates", label: "My certificates" },
  { href: "/tickets", label: "My tickets" },
  { href: "/account/delete", label: "Delete account" },
];

/**
 * K19: the web account pages, signed in through K18. The same settings the
 * app has, on the same APIs; linked sign-in methods and the notification
 * inbox stay in the app.
 */
export default function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/account";
  const { session, ready, pending } = useWebSession();

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />
      <section className="px-5 pb-24 pt-28 sm:px-8 md:pt-32">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-[clamp(1.5rem,3vw,2.2rem)] leading-tight text-paper">My account</h1>
          {session && (
            <p className="mt-2 text-sm text-paper/65">
              Signed in as <strong className="text-paper">{session.email}</strong>.{" "}
              <button type="button" onClick={clearSession} className="underline hover:text-paper">
                Sign out
              </button>
            </p>
          )}
          {session && (
            <nav aria-label="Account" className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
              {TABS.map((t) => {
                const active = pathname === t.href;
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors duration-150 ${
                      active ? "bg-primary text-ink" : "bg-night-2 text-paper/80 hover:bg-night-3 hover:text-paper"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          )}
          <div className="mt-8 rounded-3xl bg-night-2 p-6 sm:p-8">
            {!ready ? null : session ? (
              children
            ) : (
              <SignIn
                next={pathname}
                pending={pending}
                intro="Sign in with the email on your Unifesto account. We send you a code to confirm it's you."
                submitLabel="Sign in"
              />
            )}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
