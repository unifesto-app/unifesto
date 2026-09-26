import { SessionProvider } from "@/lib/context/SessionContext";
import { AppShell } from "@/components/shell/AppShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
