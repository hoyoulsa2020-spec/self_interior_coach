"use client";

import { useRef, useState } from "react";

type ProviderSearchBarProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onSearch?: () => void;
};

export default function ProviderSearchBar({ value, onChange, placeholder, onSearch }: ProviderSearchBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    if (!searchOpen) {
      setSearchOpen(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (onSearch) {
      onSearch();
    } else {
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-xl border border-gray-200 bg-white">
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => { if (!value.trim()) setSearchOpen(false); }}
          onKeyDown={(e) => { if (e.key === "Enter" && onSearch) onSearch(); }}
          className={`min-w-0 flex-1 border-0 px-4 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-0 ${searchOpen ? "block" : "hidden sm:block"}`}
        />
        <button
          type="button"
          onClick={handleButtonClick}
          className={`flex items-center justify-center bg-indigo-600 px-4 py-2.5 text-white transition hover:bg-indigo-700 active:bg-indigo-800 min-h-[44px] min-w-[44px] sm:min-w-[48px] ${searchOpen ? "shrink-0 rounded-r-xl" : "flex-1 shrink-0 rounded-xl sm:flex-initial sm:rounded-l-none sm:rounded-r-xl"}`}
          aria-label="검색"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </button>
      </div>
    </div>
  );
}
