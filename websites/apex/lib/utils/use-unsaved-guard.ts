import { useCallback, useEffect } from "react";

/**
 * K3: editors ask before throwing away unsaved changes, whether the modal is
 * closed (Esc, backdrop, Cancel) or the tab is. Returns a wrapper for close.
 */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  return useCallback(
    (close: () => void) => {
      if (!dirty || window.confirm("Discard your unsaved changes?")) close();
    },
    [dirty],
  );
}
