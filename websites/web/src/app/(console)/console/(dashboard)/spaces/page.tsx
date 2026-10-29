import Link from "next/link";
import { SpaceList } from "./SpaceList";

/** My Spaces: every space I help run. Opening one puts its menu in the sidebar. */
export default function MySpacesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">My Spaces</h1>
        <Link href="/request-space" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          Request another space
        </Link>
      </div>
      <SpaceList />
    </div>
  );
}
