import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// Public account-deletion page. Google Play's Data safety form requires a web
// link where users can request deletion without the app. Keep it in step with
// the real flow: DELETE /users/me (30-day grace, cancellable) and the purge job
// in AccountDeletionSchedulerService.
export const metadata = {
  title: "Delete Your Account | Unifesto",
  description: "How to delete your Unifesto account and what happens to your data.",
  openGraph: {
    title: "Delete Your Account | Unifesto",
    description: "How to delete your Unifesto account and what happens to your data.",
    type: "website",
    url: "https://www.unifesto.app/delete-account",
    siteName: "Unifesto",
  },
};

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-[#050507] overflow-x-hidden text-white">
      <Navbar />

      <section className="relative pt-36 pb-20 px-6 text-center overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-72 w-[36rem] rounded-full bg-primary/12 blur-[130px]"
        />
        <div className="relative z-10 max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-[-0.02em] leading-tight mb-5">
            Delete your account
          </h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-2xl mx-auto">
            You can delete your Unifesto account at any time, in the app or by email.
          </p>
        </div>
      </section>

      <section className="relative px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-4">In the app</h2>
            <ol className="list-decimal list-inside text-slate-300 space-y-2 mb-4 ml-4">
              <li>Open the Unifesto app and sign in.</li>
              <li>Go to <strong className="text-white">Profile</strong> and tap <strong className="text-white">Account settings</strong>.</li>
              <li>Tap <strong className="text-white">Delete account</strong> and confirm.</li>
            </ol>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-4">By email</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              No access to the app? Email{" "}
              <a href="mailto:privacy@unifesto.app?subject=Delete%20my%20account" className="text-primary hover:underline">
                privacy@unifesto.app
              </a>{" "}
              with the subject &quot;Delete my account&quot;, from the email address you sign in with. We&apos;ll confirm
              it&apos;s you and process the request within 7 days.
            </p>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-4">What happens next</h2>
            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
              <li>
                Your account is scheduled for deletion in <strong className="text-white">30 days</strong>. Sign in before
                then and you can keep it.
              </li>
              <li>
                After 30 days we permanently remove your personal details: name, email, phone number, profile photo,
                sign-in methods, saved payout accounts and notification settings.
              </li>
              <li>
                Records we must keep by law, such as payment, refund and tax records, stay for the required period with
                your personal details removed.
              </li>
            </ul>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-4">Before you delete</h2>
            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4 ml-4">
              <li>If you own a space, transfer it to another member or archive it first.</li>
              <li>If you have a ticket for an upcoming event, cancel it or wait until the event is over.</li>
            </ul>
          </div>

          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
            <p className="text-slate-300 mb-2">
              <strong className="text-white">Privacy questions:</strong>{" "}
              <a href="mailto:privacy@unifesto.app" className="text-primary hover:underline">privacy@unifesto.app</a>
            </p>
            <p className="text-slate-300 mb-2">
              <strong className="text-white">Grievance officer:</strong> Vinay Buddolla,{" "}
              <a href="mailto:vinay@unifesto.app" className="text-primary hover:underline">vinay@unifesto.app</a>
            </p>
            <p className="text-slate-300">
              <strong className="text-white">Company:</strong> Unifesto Private Limited
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
