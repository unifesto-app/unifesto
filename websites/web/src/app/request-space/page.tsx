import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import RequestSpaceClient from "./RequestSpaceClient";

export const metadata: Metadata = {
  title: "Request a Space | Unifesto",
  description:
    "Run your club, community or institution on Unifesto. Request a Space and our team will review it.",
  openGraph: {
    title: "Request a Space | Unifesto",
    description: "Run your club, community or institution on Unifesto.",
    type: "website",
    url: "https://www.unifesto.app/request-space",
    siteName: "Unifesto",
  },
};

export default function RequestSpacePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />
      <section className="mx-auto max-w-2xl px-4 pb-24 pt-32 sm:px-6">
        <h1 className="text-3xl font-extrabold leading-tight md:text-5xl">Request a Space</h1>
        <p className="mt-4 text-slate-400">
          A Space is home for your club, community or institution. Your team, events and money live
          there. Tell us about it and we will review your request.
        </p>
        <RequestSpaceClient />
      </section>
      <Footer />
    </main>
  );
}
