"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface MobileNavContextValue {
  /** Whether the mobile navigation drawer is open. */
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const MobileNavContext = createContext<MobileNavContextValue>({
  open: false,
  setOpen: () => {},
  toggle: () => {},
});

/**
 * Coordinates the mobile nav drawer between the header (which owns the
 * hamburger) and the dashboard layout (which owns the drawer). Both live in
 * different layout files, so the open-state is lifted into this shared context.
 */
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <MobileNavContext.Provider value={{ open, setOpen, toggle }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  return useContext(MobileNavContext);
}
