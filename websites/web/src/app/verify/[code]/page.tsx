import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { verifyCertificate } from "@/lib/api/certificates";

interface VerifyPageProps {
  params: Promise<{ code: string }>;
}

// Public and shareable → let a certificate link render with real, crawlable
// preview data. `generateMetadata` verifies server-side before the HTML ships.
export async function generateMetadata({
  params,
}: VerifyPageProps): Promise<Metadata> {
  const { code } = await params;
  const cert = await verifyCertificate(code).catch(() => null);

  if (!cert) {
    return {
      title: "Certificate not found | Unifesto",
      robots: { index: false, follow: false },
    };
  }

  const title = `${cert.recipientName} — ${cert.eventTitle} | Unifesto`;
  const description = cert.valid
    ? `Verified certificate issued to ${cert.recipientName} by ${cert.issuer} for ${cert.eventTitle}.`
    : `This certificate (${cert.certificateNumber}) has been revoked.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Unifesto",
      ...(cert.imageUrl ? { images: [{ url: cert.imageUrl }] } : {}),
    },
    twitter: {
      card: cert.imageUrl ? "summary_large_image" : "summary",
      title,
      description,
    },
  };
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function VerifyPage({ params }: VerifyPageProps) {
  const { code } = await params;
  const cert = await verifyCertificate(code).catch(() => null);

  return (
    <main className="min-h-screen bg-black overflow-x-hidden">
      <Navbar />

      <section className="relative pt-36 pb-24 px-6 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(52,145,255,0.1) 0%, transparent 70%)",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 max-w-2xl mx-auto">
          {/* Not found */}
          {!cert ? (
            <div className="p-10 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm text-center">
              <StatusIcon variant="unknown" />
              <h1 className="text-2xl font-bold text-white mt-5 mb-2">
                Certificate not found
              </h1>
              <p className="text-slate-400 mb-6">
                We couldn&apos;t find a certificate for this code. Check that the
                link was copied in full.
              </p>
              <Link
                href="/"
                className="inline-block px-5 py-2.5 rounded-lg border border-white/10 text-white hover:bg-white/[0.04] transition-colors"
              >
                Go home
              </Link>
            </div>
          ) : (
            <>
              {/* Verdict banner */}
              <div
                className={`p-6 rounded-2xl border text-center mb-6 ${
                  cert.valid
                    ? "border-green-500/20 bg-green-500/[0.04]"
                    : "border-red-500/20 bg-red-500/[0.04]"
                }`}
              >
                <StatusIcon variant={cert.valid ? "valid" : "revoked"} />
                <h1
                  className={`text-2xl font-bold mt-4 mb-1 ${
                    cert.valid ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {cert.valid ? "Verified certificate" : "Certificate revoked"}
                </h1>
                <p className="text-slate-400 text-sm">
                  {cert.valid
                    ? "This certificate is authentic and was issued by Unifesto."
                    : `This certificate was revoked${
                        cert.revokedAt ? ` on ${formatDate(cert.revokedAt)}` : ""
                      } and is no longer valid.`}
                </p>
              </div>

              {/* Preview */}
              {cert.imageUrl && (
                <div
                  className={`rounded-2xl border border-white/10 overflow-hidden mb-6 ${
                    cert.valid ? "" : "opacity-60 grayscale"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cert.imageUrl}
                    alt={`Certificate for ${cert.eventTitle}`}
                    className="w-full h-auto"
                  />
                </div>
              )}

              {/* Details */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm divide-y divide-white/5">
                <DetailRow label="Recipient" value={cert.recipientName} />
                <DetailRow label="Event" value={cert.eventTitle} />
                <DetailRow label="Issued by" value={cert.issuer} />
                <DetailRow
                  label="Certificate no."
                  value={cert.certificateNumber}
                />
                <DetailRow
                  label="Issued on"
                  value={formatDate(cert.issuedAt)}
                />
              </div>

              {cert.valid && cert.pdfUrl && (
                <div className="mt-6 text-center">
                  <a
                    href={cert.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-6 py-3 rounded-lg text-sm font-semibold text-white bg-[#0062ff] hover:bg-[#0052d6] transition-colors"
                  >
                    Download PDF
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm text-white font-medium text-right">{value}</span>
    </div>
  );
}

function StatusIcon({
  variant,
}: {
  variant: "valid" | "revoked" | "unknown";
}) {
  const config = {
    valid: {
      ring: "border-green-500/30 bg-green-500/10 text-green-400",
      path: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    revoked: {
      ring: "border-red-500/30 bg-red-500/10 text-red-400",
      path: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    unknown: {
      ring: "border-white/10 bg-white/[0.03] text-slate-500",
      path: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    },
  }[variant];

  return (
    <div
      className={`w-14 h-14 rounded-full border flex items-center justify-center mx-auto ${config.ring}`}
    >
      <svg
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d={config.path}
        />
      </svg>
    </div>
  );
}
