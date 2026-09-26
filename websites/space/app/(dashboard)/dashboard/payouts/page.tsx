import { redirect } from "next/navigation";

// Payouts moved into the unified Finance workspace.
export default function PayoutsRedirect() {
  redirect("/dashboard/financials?tab=payouts");
}
