"use client";

import { createContext, useContext } from "react";

type DashboardLayoutContextValue = {
  sidebarCollapsed: boolean;
  aiModalOpen: boolean;
  setAiModalOpen: (open: boolean) => void;
};

export const DashboardLayoutContext = createContext<DashboardLayoutContextValue>({
  sidebarCollapsed: false,
  aiModalOpen: false,
  setAiModalOpen: () => {},
});

export function useDashboardLayout() {
  return useContext(DashboardLayoutContext);
}
