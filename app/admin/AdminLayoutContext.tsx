"use client";

import { createContext, useContext } from "react";

type AdminLayoutContextValue = {
  sidebarCollapsed: boolean;
};

export const AdminLayoutContext = createContext<AdminLayoutContextValue>({
  sidebarCollapsed: false,
});

export function useAdminLayout() {
  return useContext(AdminLayoutContext);
}
