"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { loginHref } from "@/console/lib/utils/auth";

/**
 * A personal page (tickets, account) with no web session: someone still on an
 * old space-app sign-in, or a session that just ended. One sign-in (V8), then
 * back to this page.
 */
export function SignInPrompt() {
  const pathname = usePathname();
  return (
    <p className="text-sm text-muted-foreground">
      Sign in to see this page.{" "}
      <Link href={loginHref(pathname)} className="font-medium text-primary hover:underline">
        Sign in
      </Link>
    </p>
  );
}
