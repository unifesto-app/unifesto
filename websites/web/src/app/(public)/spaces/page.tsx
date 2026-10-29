import { getAllSpaces } from "@/lib/api/spaces";
import SpacesClient from "./SpacesClient";

// K2: fetch on the server so the cards (real links) are in the HTML crawlers read.
export default async function SpacesPage() {
  const spaces = await getAllSpaces();
  return <SpacesClient initialSpaces={spaces.length ? spaces : null} />;
}
