import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Privacy Policy | Unifesto",
  description: "Learn how Unifesto collects, uses, and protects your personal information. Your privacy is our priority.",
  keywords: ["privacy policy", "data protection", "user privacy", "unifesto privacy", "data security"],
  openGraph: {
    title: "Privacy Policy | Unifesto",
    description: "Learn how Unifesto collects, uses, and protects your personal information.",
    type: "website",
    url: "https://www.unifesto.app/privacy",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy | Unifesto",
    description: "Learn how Unifesto collects, uses, and protects your personal information.",
    site: "@unifestoapp",
  },
};

export default function PrivacyPage() {
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
            Privacy Policy
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
                At Unifesto Private Limited ("Unifesto", "we", "us", or "our"), we are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform.
              </p>
            </div>

            {/* Section 1 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">1. Information We Collect</h2>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">1.1 Information You Provide</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                We collect information that you voluntarily provide when you:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Create an account (name, email, phone number, organisation)</li>
                <li>Register for events (personal details, preferences)</li>
                <li>Host events (space information, event details)</li>
                <li>Contact our support team</li>
                <li>Subscribe to our newsletter</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">1.2 Automatically Collected Information</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                When you use our platform, we automatically collect:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Device information (IP address, browser type, operating system)</li>
                <li>Usage data (pages visited, features used, time spent)</li>
                <li>Location data (with your permission)</li>
                <li>Cookies and similar tracking technologies</li>
              </ul>
            </div>

            {/* Section 2 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">2. How We Use Your Information</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                We use the collected information to:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Provide, maintain, and improve our services</li>
                <li>Process event registrations and ticket purchases</li>
                <li>Send event reminders and updates</li>
                <li>Personalize your experience and recommendations</li>
                <li>Communicate with you about our services</li>
                <li>Analyze usage patterns and optimize platform performance</li>
                <li>Prevent fraud and ensure platform security</li>
                <li>Comply with legal obligations</li>
              </ul>
            </div>

            {/* Section 3 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">3. Information Sharing and Disclosure</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                We do not sell your personal information. We may share your information with:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li><strong className="text-white">Event Organizers:</strong> When you register for an event, we share necessary information with the organizer</li>
                <li><strong className="text-white">Service Providers:</strong> Third-party vendors who help us operate our platform (payment processors, email services, analytics)</li>
                <li><strong className="text-white">Legal Requirements:</strong> When required by law or to protect our rights</li>
                <li><strong className="text-white">Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              </ul>
            </div>

            {/* Section 4 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">4. Data Security</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                We implement appropriate technical and organizational measures to protect your personal information, including:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Encryption of data in transit and at rest</li>
                <li>Regular security assessments and updates</li>
                <li>Access controls and authentication measures</li>
                <li>Employee training on data protection</li>
              </ul>
              <p className="text-slate-300 leading-relaxed">
                However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </div>

            {/* Section 5 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">5. Your Rights and Choices</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                You have the right to:
              </p>
              <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
                <li>Access and review your personal information</li>
                <li>Correct inaccurate or incomplete data</li>
                <li>Delete your account and associated data</li>
                <li>Opt-out of marketing communications</li>
                <li>Restrict or object to certain data processing</li>
                <li>Data portability (receive your data in a structured format)</li>
              </ul>
              <p className="text-slate-300 leading-relaxed">
                To exercise these rights, contact us at <a href="mailto:privacy@unifesto.app" className="text-primary hover:underline">privacy@unifesto.app</a>
              </p>
            </div>

            {/* Section 6 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">6. Cookies and Tracking</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                We use cookies and similar technologies to enhance your experience. You can control cookies through your browser settings, but disabling them may affect platform functionality.
              </p>
            </div>

            {/* Section 7 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">7. Children's Privacy</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                Our services are intended for users aged 13 and above. We do not knowingly collect information from children under 13. If you believe we have collected such information, please contact us immediately.
              </p>
            </div>

            {/* Section 8 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">8. Changes to This Policy</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                We may update this Privacy Policy from time to time. We will notify you of significant changes by email or through a prominent notice on our platform. Your continued use of our services after changes constitutes acceptance of the updated policy.
              </p>
            </div>

            {/* Contact */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4">9. Contact Us</h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                If you have questions or concerns about this Privacy Policy, please contact us:
              </p>
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
                <p className="text-slate-300 mb-2"><strong className="text-white">Email:</strong> <a href="mailto:privacy@unifesto.app" className="text-primary hover:underline">privacy@unifesto.app</a></p>
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
