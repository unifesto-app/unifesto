import SupportClient from "./SupportClient";
import { getHelpArticles } from "@/lib/api/help";

export default async function SupportPage() {
  return <SupportClient hasHelp={(await getHelpArticles()).length > 0} />;
}
