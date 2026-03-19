"use client";

import { useState, useEffect } from "react";

type Props = {
  title: string;
  subtitle?: string;
  defaultCollapsed?: boolean;
  storageKey?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  className?: string;
};

export default function CollapsiblePanel({
  title,
  subtitle,
  defaultCollapsed = false,
  storageKey,
  children,
  headerRight,
  className = "",
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved !== null) setCollapsed(saved === "1");
      } catch {
        /* ignore */
      }
    }
  }, [storageKey]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden ${className}`}>
      <div
        className={`flex items-center justify-between gap-3 px-4 py-3 pr-6 ${collapsed ? "cursor-pointer hover:bg-gray-50" : "border-b border-gray-100"}`}
        onClick={collapsed ? toggle : undefined}
      >
        <div className="flex-1 min-w-0 overflow-hidden">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          {subtitle && !collapsed && (
            <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!collapsed && headerRight}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (!collapsed) toggle(); }}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 touch-manipulation"
            aria-label={collapsed ? "펼치기" : "접기"}
            title={collapsed ? "펼치기" : "접기"}
          >
            {collapsed ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="p-5 pt-0">
          {children}
        </div>
      )}
    </div>
  );
}
