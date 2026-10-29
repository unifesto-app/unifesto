import type { Metadata } from "next";
import { safeNext } from "@/lib/auth-server";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return <LoginClient next={safeNext(typeof next === "string" ? next : null)} />;
}
