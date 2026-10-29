import { SessionProvider } from "@/console/lib/context/SessionContext";
import { AppShell } from "@/console/components/shell/AppShell";
import { ConfirmDialogHost } from "@/console/components/shared/ConfirmDialog";

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
