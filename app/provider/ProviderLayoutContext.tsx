"use client";

import { createContext, useContext } from "react";

type ProviderLayoutContextValue = {
  sidebarCollapsed: boolean;
};

export const ProviderLayoutContext = createContext<ProviderLayoutContextValue>({
  sidebarCollapsed: false,
});

export function useProviderLayout() {
  return useContext(ProviderLayoutContext);
}
