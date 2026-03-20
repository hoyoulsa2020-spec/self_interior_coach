"use client";

import { useEffect, useRef, useState } from "react";

const POSTCODE_SCRIPT = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

type AddressData = {
  address?: string;
  roadAddress?: string;
  jibunAddress?: string;
  userSelectedType?: string;
};

type Props = {
  open: boolean;
  onSelect: (address: string) => void;
  onClose: () => void;
};

/** 카카오(다음) 우편번호 검색을 레이어(embed) 모드로 띄움. 새 탭/팝업 대신 현재 페이지에 오버레이로 표시. */
export default function AddressSearchLayer({ open, onSelect, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [height, setHeight] = useState(450);

  useEffect(() => {
    if (!open) return;
    const hasApi = !!(window as unknown as { daum?: { Postcode?: unknown }; kakao?: { Postcode?: unknown } }).daum?.Postcode
      || (window as unknown as { kakao?: { Postcode?: unknown } }).kakao?.Postcode;
    if (hasApi) {
      setScriptLoaded(true);
      return;
    }
    const el = document.getElementById("daum-postcode-script");
    if (el) {
      el.addEventListener("load", () => setScriptLoaded(true), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.id = "daum-postcode-script";
    s.src = POSTCODE_SCRIPT;
    s.onload = () => setScriptLoaded(true);
    document.head.appendChild(s);
  }, [open]);

  useEffect(() => {
    if (!open || !scriptLoaded || !containerRef.current) return;
    const daum = (window as unknown as { daum?: { Postcode: new (opts: DaumPostcodeOptions) => DaumPostcodeInstance } }).daum;
    const kakao = (window as unknown as { kakao?: { Postcode: new (opts: DaumPostcodeOptions) => DaumPostcodeInstance } }).kakao;
    const Postcode = daum?.Postcode ?? kakao?.Postcode;
    if (!Postcode) return;

    const getAddr = (data: AddressData): string => {
      if (data.userSelectedType === "R") return data.roadAddress ?? data.address ?? "";
      if (data.userSelectedType === "J") return data.jibunAddress ?? data.address ?? "";
      return data.address ?? data.roadAddress ?? data.jibunAddress ?? "";
    };

    new Postcode({
      oncomplete: (data: AddressData) => {
        onSelect(getAddr(data));
        onClose();
      },
      onresize: (size: { height: number }) => {
        setHeight(size.height);
      },
      width: "100%",
      height: "100%",
      maxSuggestItems: 5,
    }).embed(containerRef.current);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [open, scriptLoaded, onSelect, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
          <span className="text-sm font-semibold text-gray-800">주소 검색</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="닫기"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden"
          style={{ minHeight: 400, height }}
        >
          {!scriptLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type DaumPostcodeOptions = {
  oncomplete: (data: AddressData) => void;
  onresize?: (size: { height: number }) => void;
  width?: string;
  height?: string;
  maxSuggestItems?: number;
};

type DaumPostcodeInstance = {
  open: () => void;
  embed: (el: HTMLElement) => void;
};
