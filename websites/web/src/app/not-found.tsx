import { gradientText, brandGradient } from "@/lib/styles";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "404 - Page Not Found | Unifesto",
  description: "The page you're looking for doesn't exist.",
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-black overflow-x-hidden flex flex-col">
      <Navbar />

      {/* 404 Section */}
      <section className="relative flex-1 flex items-center justify-center px-6 pt-48 pb-20 overflow-hidden">        
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          {/* 404 Number */}
          <div className="mb-8 relative">
            <h1 
              className="text-[120px] md:text-[180px] font-extrabold leading-none animate-bounce"
              style={{ ...gradientText, animationDuration: "3s" }}
            >
              404
            </h1>
            {/* Decorative line */}
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-1 rounded-full"
              style={{ background: brandGradient }}
              aria-hidden="true"
            />
          </div>

          {/* Error Message */}
          <div className="mb-8">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
              Page not found
            </h2>
            <p className="text-slate-400 text-base md:text-lg leading-relaxed max-w-xl mx-auto">
              Oops! The page you're looking for doesn't exist. It might have been moved or deleted.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold text-black transition-all duration-300 hover:shadow-[0_0_30px_rgba(52,145,255,0.5)] hover:-translate-y-0.5"
              style={{ background: brandGradient }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Go to Homepage
            </a>
            <a
              href="/events"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-all duration-300"
            >
              Browse Events
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {/* Helpful Links */}
          <div className="mt-12 pt-8 border-t border-white/10">
            <p className="text-sm text-slate-500 mb-4">Looking for something specific?</p>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
              <a href="/events" className="text-slate-400 hover:text-white transition-colors">
                Events
              </a>
              <span className="text-slate-700">•</span>
              <a href="/spaces" className="text-slate-400 hover:text-white transition-colors">
                Spaces
              </a>
              <span className="text-slate-700">•</span>
              <a href="/host" className="text-slate-400 hover:text-white transition-colors">
                Host Event
              </a>
              <span className="text-slate-700">•</span>
              <a href="/about" className="text-slate-400 hover:text-white transition-colors">
                About Us
              </a>
              <span className="text-slate-700">•</span>
              <a href="/careers" className="text-slate-400 hover:text-white transition-colors">
                Careers
              </a>
              <span className="text-slate-700">•</span>
              <a href="mailto:support@unifesto.app" className="text-slate-400 hover:text-white transition-colors">
                Contact Support
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
