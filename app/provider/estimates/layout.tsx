"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SUB_NAV = [
  { label: "견적대기", href: "/provider/estimates" },
  { label: "계약완료", href: "/provider/estimates/completed" },
  { label: "매칭실패", href: "/provider/estimates/failed" },
];

export default function EstimatesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      <nav className="flex gap-2 border-b border-gray-200 pb-3">
        {SUB_NAV.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition
                ${isActive ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
