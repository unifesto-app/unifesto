"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Handshake, SignOut } from "@unifesto/unicon/react";
import { clearAuthToken } from "@/console/lib/utils/auth";
import { Button } from "@/console/components/ui/button";

/**
 * Sponsor portal shell. Deliberately separate from the operator AppShell — a
 * sponsor is not a space operator, so they get their own minimal chrome (no
 * space switcher, no operator nav), just a header and a sign-out.
 */
export default function SponsorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const signOut = () => {
    clearAuthToken();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Image src="/UnifestoAppWordmark.png" alt="Unifesto" width={104} height={24} className="wordmark" />
          <span className="hidden items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary sm:inline-flex">
            <Handshake className="h-3.5 w-3.5" weight="fill" /> Sponsor portal
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <SignOut className="h-4 w-4" /> Sign out
        </Button>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
