"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMyCertificates, type MyCertificate } from "@/lib/api/account";
import { useWebSession } from "@/lib/auth";
import { IST } from "@/lib/site";

/** K19: My certificates, with download and a link anyone can use to check one. Ones held for feedback come first, as in the app. */
export default function CertificatesPage() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const [certs, setCerts] = useState<MyCertificate[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) getMyCertificates(token).then(setCerts, (e) => setError(e.message));
  }, [token]);

  if (!certs) return error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-paper/65">Loading My certificates…</p>;
  if (!certs.length)
    return <p className="text-paper/75">No certificates yet. When an organiser issues you one, it shows up here and in your email.</p>;

  const locked = certs.filter((c) => c.locked);
  return (
    <div className="space-y-8">
      {locked.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-paper/75">Waiting for my feedback</h2>
          <ul className="mt-1 divide-y divide-white/[0.06]">
            {locked.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <Link href={`/event/${c.event.slug}`} className="font-semibold text-paper hover:underline">
                  {c.event.title}
                </Link>
                <Link href={`/console/feedback/${c.event.id}`} className="text-sm font-medium text-primary hover:underline">
                  Give feedback to unlock
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="divide-y divide-white/[0.06]">
        {certs
          .filter((c) => !c.locked)
          .map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <Link href={`/event/${c.event.slug}`} className="font-semibold text-paper hover:underline">
                  {c.event.title}
                </Link>
                <p className="mt-0.5 text-xs text-paper/60">
                  {new Date(c.issuedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST })} · No.{" "}
                  {c.certificateNumber}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                {(c.pdfUrl || c.imageUrl) && (
                  <a href={(c.pdfUrl || c.imageUrl)!} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                    Download
                  </a>
                )}
                <Link href={`/verify/${c.verificationCode}`} className="text-paper/70 hover:underline">
                  Verify
                </Link>
              </div>
            </li>
          ))}
      </ul>
    </div>
  );
}
