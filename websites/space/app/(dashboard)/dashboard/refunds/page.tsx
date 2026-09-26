import { redirect } from "next/navigation";

// Refunds moved into the unified Finance workspace.
export default function RefundsRedirect() {
  redirect("/dashboard/financials?tab=refunds");
}
