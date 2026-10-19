import { SessionProvider } from "@/lib/context/SessionContext";
import { AppShell } from "@/components/shell/AppShell";
import { ConfirmDialogHost } from "@/components/shared/ConfirmDialog";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
      <ConfirmDialogHost />
    </SessionProvider>
  );
}
