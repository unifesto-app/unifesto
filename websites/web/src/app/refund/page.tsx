import { gradientText, brandGradient } from "@/lib/styles";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Refund Policy | Unifesto",
  description: "Learn about Unifesto's refund and cancellation policy for event tickets. Fair and transparent refund process.",
  keywords: ["refund policy", "cancellation policy", "ticket refund", "event refund", "unifesto refund"],
  openGraph: {
    title: "Refund Policy | Unifesto",
    description: "Learn about Unifesto's refund and cancellation policy for event tickets.",
    type: "website",
    url: "https://www.unifesto.app/refund",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary",
    title: "Refund Policy | Unifesto",
    description: "Learn about Unifesto's refund and cancellation policy for event tickets.",
    site: "@unifestoapp",
  },
};

export default function RefundPage() {
  return (
    <main className="min-h-screen bg-black overflow-x-hidden">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-36 pb-20 px-6 text-center overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(52,145,255,0.1) 0%, transparent 70%)" }}
          aria-hidden="true"
        />
        <div className="relative z-10 max-w-4xl mx-auto">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-4" style={gradientText}>Legal</p>
          <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight mb-5">
            Refund Policy
          </h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-2xl mx-auto">
            Last updated: April 16, 2026
          </p>
        </div>
      </section>

      {/* Content Section */}
      <section className="relative px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="prose prose-invert prose-slate max-w-none">
            
            {/* Introduction */}
            <div className="mb-12">
              <p className="text-slate-300 leading-relaxed mb-4">
                This Refund Policy outlines the terms and conditions for refunds and cancellations on the Unifesto platform. Please read this policy carefully before purchasing tickets or registering for events.
              </p>
            </div>

            {/* Section 1 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">1. General Refund Policy</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                Refund eligibility depends on the event organizer's specific refund policy. Unifesto acts as a platform connecting event organizers and attendees. Each event may have different refund terms set by the organizer.
              </p>
            </div>

            {/* Section 2 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">2. Event Cancellation by Organizer</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                If an event is cancelled by the organizer:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>You are entitled to a full refund of the ticket price</li>
                <li>Refunds will be processed within 7-10 business days</li>
                <li>The refund will be credited to your original payment method</li>
                <li>Platform fees are non-refundable unless otherwise stated</li>
              </ul>
            </div>

            {/* Section 3 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">3. Attendee-Initiated Cancellations</h2>
              
              <h3 className="text-xl font-semibold text-white mb-3 mt-6">3.1 Standard Refund Timeline</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                Unless specified otherwise by the event organizer:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li><strong className="text-white">More than 7 days before event:</strong> 80% refund (20% cancellation fee)</li>
                <li><strong className="text-white">3-7 days before event:</strong> 50% refund (50% cancellation fee)</li>
                <li><strong className="text-white">Less than 3 days before event:</strong> No refund</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">3.2 Free Events</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                For free events (RSVP only), you can cancel your registration at any time before the event without penalty.
              </p>
            </div>

            {/* Section 4 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">4. Non-Refundable Situations</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                Refunds will not be provided in the following cases:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Failure to attend the event (no-show)</li>
                <li>Late arrival or early departure from the event</li>
                <li>Dissatisfaction with event content or experience</li>
                <li>Events marked as "non-refundable" by the organizer</li>
                <li>Violation of event terms or code of conduct</li>
              </ul>
            </div>

            {/* Section 5 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">5. How to Request a Refund</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                To request a refund:
              </p>
              <ol className="list-decimal list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Log in to your Unifesto account</li>
                <li>Go to "My Tickets" or "My Events"</li>
                <li>Select the event and click "Request Refund"</li>
                <li>Provide a reason for cancellation (optional)</li>
                <li>Submit your refund request</li>
              </ol>
              <p className="text-slate-300 leading-relaxed">
                Alternatively, contact us at <a href="mailto:refunds@unifesto.app" className="text-blue-400 hover:text-blue-300">refunds@unifesto.app</a> with your ticket details.
              </p>
            </div>

            {/* Section 6 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">6. Refund Processing Time</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                Once your refund request is approved:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Processing begins within 2-3 business days</li>
                <li>Refunds are credited within 7-10 business days</li>
                <li>Bank processing may take an additional 3-5 business days</li>
                <li>You will receive an email confirmation once processed</li>
              </ul>
            </div>

            {/* Section 7 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">7. Event Postponement or Rescheduling</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                If an event is postponed or rescheduled:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Your ticket remains valid for the new date</li>
                <li>You may request a refund if you cannot attend the new date</li>
                <li>Refund terms depend on the organizer's policy</li>
                <li>You will be notified via email about any changes</li>
              </ul>
            </div>

            {/* Section 8 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">8. Platform Fees</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                Unifesto charges a small platform fee for paid events. This fee is generally non-refundable unless:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>The event is cancelled by the organizer</li>
                <li>There is a technical error on our platform</li>
                <li>Required by applicable law</li>
              </ul>
            </div>

            {/* Section 9 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">9. Disputes and Exceptions</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                If you believe you are entitled to a refund not covered by this policy, please contact our support team. We review exceptional cases on an individual basis and may provide refunds at our discretion.
              </p>
            </div>

            {/* Section 10 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">10. Changes to This Policy</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                We reserve the right to modify this Refund Policy at any time. Changes will be effective immediately upon posting. Your continued use of the platform constitutes acceptance of the updated policy.
              </p>
            </div>

            {/* Contact */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">11. Contact Us</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                For refund-related questions or assistance:
              </p>
              <div className="bg-white/[0.02] border border-white/10 rounded-xl p-6">
                <p className="text-slate-300 mb-2"><strong className="text-white">Refunds:</strong> <a href="mailto:refunds@unifesto.app" className="text-blue-400 hover:text-blue-300">refunds@unifesto.app</a></p>
                <p className="text-slate-300 mb-2"><strong className="text-white">Support:</strong> <a href="mailto:support@unifesto.app" className="text-blue-400 hover:text-blue-300">support@unifesto.app</a></p>
                <p className="text-slate-300"><strong className="text-white">Company:</strong> Unifesto Private Limited</p>
              </div>
            </div>

          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
