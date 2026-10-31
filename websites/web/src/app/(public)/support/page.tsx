import SupportClient from "./SupportClient";
import { getHelpArticles } from "@/lib/api/help";

export const dynamic = "force-static"; // prerendered, CDN-cacheable: lib/cached-pages.ts

export default async function SupportPage() {
  return <SupportClient hasHelp={(await getHelpArticles()).length > 0} />;
}
