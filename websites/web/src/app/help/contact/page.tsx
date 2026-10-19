import type { Metadata } from "next";
import Link from "next/link";
import { withSocial } from "@/lib/seo";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/site/PageHero";
import ContactClient from "./ContactClient";

export const metadata: Metadata = withSocial({
  alternates: { canonical: "/help/contact" },
  title: "Contact support",
  description: "Ask Unifesto Assist about tickets, refunds and events, or reach a person on our support team.",
}, { title: "Contact Unifesto support", description: "Ask Assist, or reach a person on our support team." });

export default function ContactPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />
      <PageHero
        lines={["Contact", "support."]}
        accentFrom={1}
        size="md"
        lede={
          <>
            Assist answers right away and passes your question to a person when it can&apos;t. For your bookings and refunds, the{" "}
            <Link href="/download" className="font-semibold text-primary underline-offset-4 hover:underline">
              Unifesto app
            </Link>{" "}
            can look things up for you.
          </>
        }
      />
      <section className="px-5 pb-24 pt-14 sm:px-8 md:pt-20">
        <div className="mx-auto max-w-2xl rounded-3xl bg-night-2 p-6 sm:p-10">
          <ContactClient />
        </div>
      </section>
      <Footer />
    </main>
  );
}
