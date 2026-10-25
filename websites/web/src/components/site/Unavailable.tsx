import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/** A space (or its event) the platform has taken down for now (J16). Not a 404: it may come back. */
export default function Unavailable({ what }: { what: "space" | "event" }) {
  return (
    <main className="flex min-h-screen flex-col overflow-x-hidden bg-canvas">
      <Navbar />
      <section className="flex flex-1 items-center px-4 pb-24 pt-32 sm:px-8 sm:pt-36">
        <div className="mx-auto w-full max-w-4xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-paper/65">Temporarily unavailable</p>
          <h1 className="mt-4 font-display text-[clamp(2rem,6vw,3.5rem)] font-bold leading-[1.05] text-paper" style={{ letterSpacing: "-0.03em" }}>
            This {what} is offline for now.
          </h1>
          <p className="mt-4 max-w-xl text-paper/75">
            It isn&apos;t taking registrations at the moment. Tickets you already hold still work at the door.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/events" className="btn btn-lg btn-primary">Browse events</Link>
            <Link href="/" className="btn btn-lg btn-secondary">Home</Link>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
