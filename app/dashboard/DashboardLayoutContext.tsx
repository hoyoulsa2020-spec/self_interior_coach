"use client";

import { createContext, useContext } from "react";

type DashboardLayoutContextValue = {
  sidebarCollapsed: boolean;
};

export const DashboardLayoutContext = createContext<DashboardLayoutContextValue>({
  sidebarCollapsed: false,
});

export function useDashboardLayout() {
  return useContext(DashboardLayoutContext);
}
