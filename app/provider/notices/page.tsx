"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

type Notice = {
  id: string;
  title: string;
  content: string;
  image_urls?: string[] | null;
  created_at: string;
  view_count?: number;
};

export default function ProviderNoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());

  const fetchNotices = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("notices")
      .select("id, title, content, image_urls, created_at")
      .eq("target_audience", "provider")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      setNotices([]);
    } else {
      setNotices((data ?? []) as Notice[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  const incrementView = useCallback(async (id: string) => {
    if (viewedIds.has(id)) return;
    setViewedIds((prev) => new Set(prev).add(id));
    await supabase.rpc("increment_notice_view", { nid: id });
    fetchNotices();
  }, [viewedIds, fetchNotices]);

  const handleItemClick = (n: Notice) => {
    setSelectedId(n.id);
    incrementView(n.id);
  };

  const selected = notices.find((n) => n.id === selectedId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">공지사항</h1>
        <p className="mt-0.5 text-sm text-gray-500">셀인코치에서 전달하는 공지사항입니다.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : notices.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-500">
          등록된 공지가 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleItemClick(n)}
              className="block w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-left shadow-sm transition hover:bg-gray-50 active:bg-gray-100"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-gray-800">{n.title}</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(n.created_at).toLocaleDateString("ko-KR")}
                    {(n.view_count ?? 0) > 0 && (
                      <span className="ml-2">조회 {n.view_count}회</span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-gray-400">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 상세 모달 */}
      {selected && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4 pt-6 top-[var(--header-offset)]"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="flex max-h-[calc(100vh-8rem)] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-gray-100 px-4 py-3 sm:px-6">
              <h2 className="text-lg font-semibold text-gray-800">{selected.title}</h2>
              <p className="mt-1 text-xs text-gray-500">
                {new Date(selected.created_at).toLocaleDateString("ko-KR")}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              <div
                className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_a]:text-indigo-600 [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4"
                dangerouslySetInnerHTML={{ __html: selected.content }}
              />
              {(selected.image_urls?.length ?? 0) > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selected.image_urls!.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="max-h-48 rounded-lg object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-gray-100 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
