"use client";

import { useEffect } from "react";

type Props = {
  title?: string;
  message: string;
  onClose: () => void;
  variant?: "info" | "warning" | "error" | "success";
};

function InfoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default function AlertModal({ title = "알림", message, onClose, variant = "info" }: Props) {
  const config = {
    info: { icon: InfoIcon, iconBg: "bg-indigo-100", iconColor: "text-indigo-600", btnClass: "bg-indigo-600 hover:bg-indigo-700" },
    success: { icon: SuccessIcon, iconBg: "bg-green-100", iconColor: "text-green-600", btnClass: "bg-green-600 hover:bg-green-700" },
    warning: { icon: WarningIcon, iconBg: "bg-amber-100", iconColor: "text-amber-600", btnClass: "bg-amber-600 hover:bg-amber-700" },
    error: { icon: ErrorIcon, iconBg: "bg-red-100", iconColor: "text-red-600", btnClass: "bg-red-600 hover:bg-red-700" },
  }[variant];
  const Icon = config.icon;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className={`flex h-12 w-12 items-center justify-center rounded-full ${config.iconBg} ${config.iconColor}`}>
          <Icon />
        </div>
        <h3 className="mt-4 text-base font-bold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 whitespace-pre-line">{message}</p>
        <div className="mt-6">
          <button
            type="button"
            onClick={onClose}
            className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white transition ${config.btnClass}`}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
