import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/** What next/navigation hands the page under test; tests set params and read router calls. */
export const nav = {
  params: {} as Record<string, string>,
  search: new URLSearchParams(),
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
};

vi.mock("next/navigation", () => ({
  useParams: () => nav.params,
  useSearchParams: () => nav.search,
  useRouter: () => nav.router,
  usePathname: () => "/",
  notFound: () => {
    throw new Error("notFound()");
  },
  redirect: (to: string) => {
    throw new Error(`redirect(${to})`);
  },
}));

// jsdom has no media queries: everything reports "no match" (motion on, no reduced transparency).
window.matchMedia = (media: string) =>
  ({ matches: false, media, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as never;
// Nor layout: observers never fire and nothing is under a point.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
window.IntersectionObserver = NoopObserver as never;
window.ResizeObserver = NoopObserver as never;
document.elementsFromPoint = () => [];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
