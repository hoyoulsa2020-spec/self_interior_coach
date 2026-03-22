"use client";

import { useEffect } from "react";

type Props = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  title = "확인",
  message,
  confirmLabel = "확인",
  cancelLabel = "취소",
  variant = "primary",
  onConfirm,
  onCancel,
}: Props) {
  const config = {
    primary: { btnClass: "bg-indigo-600 hover:bg-indigo-700" },
    warning: { btnClass: "bg-amber-600 hover:bg-amber-700" },
    danger: { btnClass: "bg-red-600 hover:bg-red-700" },
  }[variant];

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel, onConfirm]);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">{message}</p>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition ${config.btnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
