"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureUtm } from "@/lib/utm";

/** Records landing utm_* tags so "Open in app" can forward them. Renders nothing. */
export default function UtmCapture() {
  const pathname = usePathname();
  useEffect(() => {
    captureUtm();
  }, [pathname]);
  return null;
}
