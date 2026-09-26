import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Terms & Conditions | Unifesto",
  description: "Read the terms and conditions for using the Unifesto platform. Understand your rights and responsibilities.",
  keywords: ["terms and conditions", "terms of service", "user agreement", "unifesto terms", "platform rules"],
  openGraph: {
    title: "Terms & Conditions | Unifesto",
    description: "Read the terms and conditions for using the Unifesto platform.",
    type: "website",
    url: "https://www.unifesto.app/terms",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary",
    title: "Terms & Conditions | Unifesto",
    description: "Read the terms and conditions for using the Unifesto platform.",
    site: "@unifestoapp",
  },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#050507] overflow-x-hidden text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-36 pb-20 px-6 text-center overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-72 w-[36rem] rounded-full bg-primary/12 blur-[130px]"
        />
        <div className="relative z-10 max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-[-0.02em] leading-tight mb-5">
            Terms & Conditions
          </h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-2xl mx-auto">
            Last updated: April 16, 2026
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="relative px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="prose prose-invert prose-slate max-w-none">
            {/* Introduction */}
            <div className="mb-12">
              <p className="text-slate-300 leading-relaxed mb-4">
                Welcome to Unifesto. These Terms and Conditions ("Terms") govern your access to and use of the Unifesto platform, website, and services (collectively, the "Services"). By accessing or using our Services, you agree to be bound by these Terms.
              </p>
              <p className="text-slate-300 leading-relaxed">
                Please read these Terms carefully. If you do not agree with any part of these Terms, you may not use our Services.
              </p>
            </div>

            {/* Section 1 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">1. Acceptance of Terms</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                By creating an account, accessing, or using Unifesto, you acknowledge that you have read, understood, and agree to be bound by these Terms, our Privacy Policy, and any additional terms applicable to specific features or services.
              </p>
            </div>

            {/* Section 2 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">2. Eligibility</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                You must be at least 13 years old to use our Services. If you are under 18, you must have permission from a parent or guardian. By using our Services, you represent and warrant that you meet these eligibility requirements.
              </p>
            </div>

            {/* Section 3 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">3. User Accounts</h2>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">3.1 Account Creation</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                To access certain features, you must create an account. You agree to:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Provide accurate, current, and complete information</li>
                <li>Maintain and update your information</li>
                <li>Keep your password secure and confidential</li>
                <li>Notify us immediately of any unauthorized access</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">3.2 Account Responsibility</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                You are responsible for all activities that occur under your account. We are not liable for any loss or damage arising from unauthorized use of your account.
              </p>
            </div>

            {/* Section 4 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">4. Use of Services</h2>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">4.1 Permitted Use</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                You may use our Services for lawful purposes only, including:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Discovering and registering for events</li>
                <li>Creating and managing events (if you're an organizer)</li>
                <li>Connecting with other members and spaces</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">4.2 Prohibited Activities</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                You agree not to:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe on intellectual property rights</li>
                <li>Post false, misleading, or fraudulent content</li>
                <li>Harass, abuse, or harm other users</li>
                <li>Distribute spam, malware, or viruses</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Use automated tools to scrape or collect data</li>
                <li>Impersonate any person or entity</li>
              </ul>
            </div>

            {/* Section 5 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">5. Event Organizers</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                If you create events on Unifesto, you additionally agree to:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Provide accurate event information</li>
                <li>Honor all ticket sales and registrations</li>
                <li>Comply with applicable laws and regulations</li>
                <li>Handle attendee data responsibly</li>
                <li>Respond to attendee inquiries promptly</li>
                <li>Process refunds according to your stated policy</li>
              </ul>
            </div>

            {/* Section 6 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">6. Content and Intellectual Property</h2>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">6.1 Your Content</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                You retain ownership of content you post on Unifesto. By posting content, you grant us a worldwide, non-exclusive, royalty-free license to use, display, and distribute your content in connection with our Services.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">6.2 Our Content</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                All content, features, and functionality of our Services (including text, graphics, logos, and software) are owned by Unifesto and protected by copyright, trademark, and other intellectual property laws.
              </p>
            </div>

            {/* Section 7 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">7. Payments and Fees</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                For paid events:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>All prices are displayed in the applicable currency</li>
                <li>Payment is processed securely through our payment partners</li>
                <li>Platform fees may apply and will be clearly disclosed</li>
                <li>Refunds are subject to our Refund Policy</li>
                <li>We reserve the right to change fees with notice</li>
              </ul>
            </div>

            {/* Section 8 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">8. Disclaimers and Limitations of Liability</h2>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">8.1 Service Availability</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                Our Services are provided "as is" and "as available." We do not guarantee uninterrupted, secure, or error-free service. We may modify, suspend, or discontinue any part of our Services at any time.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">8.2 Third-Party Events</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                Unifesto is a platform connecting organizers and attendees. We are not responsible for the quality, safety, or legality of events listed on our platform. Event organizers are solely responsible for their events.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">8.3 Limitation of Liability</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                To the maximum extent permitted by law, Unifesto shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of our Services.
              </p>
            </div>

            {/* Section 9 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">9. Indemnification</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                You agree to indemnify and hold harmless Unifesto, its affiliates, and their respective officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses arising from your use of our Services or violation of these Terms.
              </p>
            </div>

            {/* Section 10 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">10. Termination</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                We may suspend or terminate your account at any time for:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Violation of these Terms</li>
                <li>Fraudulent or illegal activity</li>
                <li>Prolonged inactivity</li>
                <li>Any reason at our sole discretion</li>
              </ul>
              <p className="text-slate-300 leading-relaxed">
                You may delete your account at any time through your account settings.
              </p>
            </div>

            {/* Section 11 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">11. Governing Law and Disputes</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                These Terms are governed by the laws of India. Any disputes arising from these Terms or your use of our Services shall be subject to the exclusive jurisdiction of the courts in [City], India.
              </p>
            </div>

            {/* Section 12 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">12. Changes to Terms</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                We reserve the right to modify these Terms at any time. We will notify you of significant changes via email or through a prominent notice on our platform. Your continued use of our Services after changes constitutes acceptance of the updated Terms.
              </p>
            </div>

            {/* Section 13 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">13. Miscellaneous</h2>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li><strong className="text-white">Severability:</strong> If any provision is found unenforceable, the remaining provisions remain in effect</li>
                <li><strong className="text-white">Waiver:</strong> Our failure to enforce any right does not constitute a waiver</li>
                <li><strong className="text-white">Entire Agreement:</strong> These Terms constitute the entire agreement between you and Unifesto</li>
                <li><strong className="text-white">Assignment:</strong> You may not assign these Terms without our consent</li>
              </ul>
            </div>

            {/* Contact */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">14. Contact Us</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                If you have questions about these Terms:
              </p>
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
                <p className="text-slate-300 mb-2"><strong className="text-white">Legal:</strong> <a href="mailto:legal@unifesto.app" className="text-primary hover:underline">legal@unifesto.app</a></p>
                <p className="text-slate-300 mb-2"><strong className="text-white">Support:</strong> <a href="mailto:support@unifesto.app" className="text-primary hover:underline">support@unifesto.app</a></p>
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
