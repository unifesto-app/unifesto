import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AboutContent from "@/components/about/AboutContent";

export const metadata = {
  title: "About | Unifesto",
  description:
    "Unifesto is the operating system for the people who run events, from institutions and clubs to communities and startups in India. Built by organisers who lived the chaos, launched at Malla Reddy University, and expanding one community at a time.",
  keywords: ["about unifesto", "community events platform", "event management", "malla reddy university", "institution events"],
  openGraph: {
    title: "About Unifesto | The operating system for events",
    description:
      "How Unifesto is replacing forms, spreadsheets and group chats with one platform for institutions, clubs, communities, and startups. One community at a time.",
    type: "website",
    url: "https://www.unifesto.app/about",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary_large_image",
    title: "About Unifesto | The operating system for events",
    description:
      "How Unifesto is replacing forms, spreadsheets and group chats with one platform for institutions, clubs, communities, and startups.",
    site: "@unifestoapp",
  },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />
      <AboutContent />
      <Footer />
    </main>
  );
}
