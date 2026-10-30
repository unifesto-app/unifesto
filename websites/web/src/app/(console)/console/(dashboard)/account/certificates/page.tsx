"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMyCertificates, type MyCertificate } from "@/lib/api/account";
import { useWebSession } from "@/lib/auth";
import { IST } from "@/lib/site";
import { Button } from "@/console/components/ui/button";
import Section from "../Section";

/** K19: My certificates, with download and a link anyone can use to check one. Ones held for feedback come first, as in the app. */
export default function CertificatesPage() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const [certs, setCerts] = useState<MyCertificate[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) getMyCertificates(token).then(setCerts, (e) => setError(e.message));
  }, [token]);

  if (!certs) return error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-sm text-muted-foreground">Loading My certificates…</p>;
  if (!certs.length)
    return (
      <p className="border-t border-border pt-6 text-sm text-muted-foreground">
        No certificates yet. When an organiser issues you one, it shows up here and in your email.
      </p>
    );

  const locked = certs.filter((c) => c.locked);
  const issued = certs.filter((c) => !c.locked);
  return (
    <div>
      {locked.length > 0 && (
        <Section title="Waiting for my feedback" description="Give feedback on the event to unlock these.">
          <ul className="-my-4 divide-y divide-border">
            {locked.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <Link href={`/event/${c.event.slug}`} className="text-sm font-medium text-foreground hover:underline">
                  {c.event.title}
                </Link>
                <Button asChild size="sm">
                  <Link href={`/console/feedback/${c.event.id}`}>Give feedback to unlock</Link>
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {issued.length > 0 && (
        <Section title="Issued" description="Download one, or share its Verify link so anyone can check it.">
          <ul className="-my-4 divide-y divide-border">
            {issued.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <Link href={`/event/${c.event.slug}`} className="text-sm font-medium text-foreground hover:underline">
                    {c.event.title}
                  </Link>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {new Date(c.issuedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST })} · No.{" "}
                    {c.certificateNumber}
                  </p>
                </div>
                <div className="flex gap-1">
                  {(c.pdfUrl || c.imageUrl) && (
                    <Button asChild variant="outline" size="sm">
                      <a href={(c.pdfUrl || c.imageUrl)!} target="_blank" rel="noopener noreferrer">
                        Download
                      </a>
                    </Button>
                  )}
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/verify/${c.verificationCode}`}>Verify</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
