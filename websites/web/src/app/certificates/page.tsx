"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { gradientText } from "@/lib/styles";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { getMyCertificates, type MyCertificate } from "@/lib/api/certificates";

export default function CertificatesPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [certificates, setCertificates] = useState<MyCertificate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const checkAuth = async () => {
    const supabase = createClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (session && !sessionError) {
      setIsAuthenticated(true);
      await loadCertificates();
    } else {
      router.push("/auth");
    }
    setIsLoading(false);
  };

  const loadCertificates = async () => {
    setLoadingData(true);
    setError(null);
    try {
      const data = await getMyCertificates();
      setCertificates(data);
    } catch (err) {
      console.error("Error loading certificates:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load certificates"
      );
    } finally {
      setLoadingData(false);
    }
  };

  const verifyUrl = (code: string) =>
    typeof window !== "undefined"
      ? `${window.location.origin}/verify/${code}`
      : `/verify/${code}`;

  const handleCopyLink = (cert: MyCertificate) => {
    navigator.clipboard.writeText(verifyUrl(cert.verificationCode));
    setCopiedId(cert.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading certificates...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="min-h-screen bg-black overflow-x-hidden">
      <Navbar />

      {/* Header */}
      <section className="relative pt-36 pb-12 px-6 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(52,145,255,0.1) 0%, transparent 70%)",
          }}
          aria-hidden="true"
        />
        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-3 text-white">
            My <span style={gradientText}>Certificates</span>
          </h1>
          <p className="text-slate-400">
            Every certificate you&apos;ve earned, ready to download and share.
          </p>
        </div>
      </section>

      {/* Body */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          {loadingData ? (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="p-6 rounded-2xl border border-red-500/20 bg-red-500/[0.04] text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={loadCertificates}
                className="px-5 py-2 rounded-lg border border-white/10 text-white hover:bg-white/[0.04] transition-colors"
              >
                Try again
              </button>
            </div>
          ) : certificates.length === 0 ? (
            <div className="p-10 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm text-center">
              <div className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto mb-5">
                <svg
                  className="w-7 h-7 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                No certificates yet
              </h2>
              <p className="text-slate-400 mb-6 max-w-md mx-auto">
                When an organiser issues a certificate for an event you attended,
                it&apos;ll show up here.
              </p>
              <Link
                href="/events"
                className="inline-block px-5 py-2.5 rounded-lg border border-white/10 text-white hover:bg-white/[0.04] transition-colors"
              >
                Explore events
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {certificates.map((cert) => (
                <article
                  key={cert.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm overflow-hidden flex flex-col"
                >
                  {/* Preview */}
                  <div className="relative aspect-[1.414/1] bg-white/[0.02] border-b border-white/10">
                    {cert.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cert.imageUrl}
                        alt={`Certificate for ${cert.event.title}`}
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-sm">
                        Preview unavailable
                      </div>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="text-lg font-bold text-white mb-1 line-clamp-2">
                      {cert.event.title}
                    </h3>
                    <p className="text-xs text-slate-500 mb-1">
                      {cert.certificateNumber}
                    </p>
                    <p className="text-xs text-slate-500 mb-4">
                      Issued {formatDate(cert.issuedAt)}
                    </p>

                    {/* Actions */}
                    <div className="mt-auto flex flex-wrap gap-2">
                      {cert.pdfUrl && (
                        <a
                          href={cert.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-w-[100px] text-center px-3 py-2 rounded-lg text-sm font-semibold text-white bg-[#0062ff] hover:bg-[#0052d6] transition-colors"
                        >
                          Download PDF
                        </a>
                      )}
                      {cert.imageUrl && (
                        <a
                          href={cert.imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-w-[100px] text-center px-3 py-2 rounded-lg text-sm font-semibold text-white border border-white/10 hover:bg-white/[0.04] transition-colors"
                        >
                          Download Image
                        </a>
                      )}
                    </div>

                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleCopyLink(cert)}
                        className="flex-1 px-3 py-2 rounded-lg text-sm text-slate-300 border border-white/10 hover:bg-white/[0.04] transition-colors"
                      >
                        {copiedId === cert.id ? "Link copied!" : "Copy verify link"}
                      </button>
                      <Link
                        href={`/verify/${cert.verificationCode}`}
                        className="flex-1 text-center px-3 py-2 rounded-lg text-sm text-slate-300 border border-white/10 hover:bg-white/[0.04] transition-colors"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
