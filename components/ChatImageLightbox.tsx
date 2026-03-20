"use client";

import { useState, useEffect, useRef } from "react";

type ChatImageLightboxProps = {
  urls: string[];
  index: number;
  onClose: () => void;
};

export default function ChatImageLightbox({ urls, index, onClose }: ChatImageLightboxProps) {
  const [cur, setCur] = useState(index);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  useEffect(() => {
    setCur(index);
  }, [index]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setCur((c) => Math.min(c + 1, urls.length - 1));
      if (e.key === "ArrowLeft") setCur((c) => Math.max(c - 1, 0));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [urls.length, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) setCur((c) => Math.min(c + 1, urls.length - 1));
      else setCur((c) => Math.max(c - 1, 0));
    }
  };

  const downloadAll = async () => {
    for (let i = 0; i < urls.length; i++) {
      try {
        const res = await fetch(urls[i]);
        const blob = await res.blob();
        const ext = urls[i].split(".").pop()?.split("?")[0] || "jpg";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `chat-image-${i + 1}.${ext}`;
        a.click();
        URL.revokeObjectURL(a.href);
        await new Promise((r) => setTimeout(r, 200));
      } catch {
        // 개별 실패 시 무시
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20"
        aria-label="닫기"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {urls.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCur((c) => Math.max(c - 1, 0));
            }}
            disabled={cur === 0}
            className="absolute left-4 z-10 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20 disabled:opacity-30"
            aria-label="이전"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCur((c) => Math.min(c + 1, urls.length - 1));
            }}
            disabled={cur === urls.length - 1}
            className="absolute right-4 z-10 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20 disabled:opacity-30"
            aria-label="다음"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </>
      )}

      <div
        className="flex w-full flex-1 items-center justify-center px-14 py-16"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[cur]}
          alt=""
          className="max-h-[75vh] max-w-full rounded-xl object-contain shadow-2xl"
          draggable={false}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 border-t border-white/10 bg-black/50 py-4">
        {urls.length > 1 && (
          <span className="text-sm text-white/70">
            {cur + 1} / {urls.length}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            downloadAll();
          }}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          한번에 다운로드
        </button>
      </div>
    </div>
  );
}
