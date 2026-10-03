"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type SidebarState = {
  open: boolean;
  toggle: () => void;
  close: () => void;
};

const SidebarContext = createContext<SidebarState | null>(null);

export function useSidebar(): SidebarState {
  const state = useContext(SidebarContext);
  if (state === null) {
    throw new Error("useSidebar must be used inside a SidebarProvider");
  }
  return state;
}

/**
 * Owns the mobile sidebar state so the topbar's menu button and the sidebar
 * itself agree without either one reaching into the other.
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((current) => !current), []);
  const close = useCallback(() => setOpen(false), []);

  const value = useMemo<SidebarState>(() => ({ open, toggle, close }), [open, toggle, close]);

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}
