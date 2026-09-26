import { redirect } from "next/navigation";

// Payout accounts moved into the unified Finance workspace.
export default function BankAccountRedirect() {
  redirect("/dashboard/financials?tab=accounts");
}
