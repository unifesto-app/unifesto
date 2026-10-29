import { SessionProvider } from "@/console/lib/context/SessionContext";
import { AppShell } from "@/console/components/shell/AppShell";
import { ConfirmDialogHost } from "@/console/components/shared/ConfirmDialog";
// Was the /dashboard segment's own layout; with that segment gone it wraps the same pages from here.
import SpaceRail from "./SpaceRail";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AppShell>
        <SpaceRail>{children}</SpaceRail>
      </AppShell>
      <ConfirmDialogHost />
    </SessionProvider>
  );
}
