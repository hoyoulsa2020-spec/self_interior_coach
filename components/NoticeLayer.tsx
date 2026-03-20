"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

type Notice = {
  id: string;
  title: string;
  content: string;
  image_urls?: string[] | null;
  created_at: string;
};

type NoticeLayerProps = {
  targetAudience: "consumer" | "provider";
};

export default function NoticeLayer({ targetAudience }: NoticeLayerProps) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());

  const fetchNotices = useCallback(async () => {
    const { data, error } = await supabase
      .from("notices")
      .select("id, title, content, image_urls, created_at")
      .eq("target_audience", targetAudience)
      .order("created_at", { ascending: false });
    if (error) {
      setNotices([]);
    } else {
      setNotices((data ?? []) as Notice[]);
    }
  }, [targetAudience]);

  useEffect(() => {
    if (open) fetchNotices();
  }, [open, fetchNotices]);

  const incrementView = useCallback(async (id: string) => {
    if (viewedIds.has(id)) return;
    setViewedIds((prev) => new Set(prev).add(id));
    await supabase.rpc("increment_notice_view", { nid: id });
  }, [viewedIds]);

  const handleItemClick = (n: Notice) => {
    setSelectedId(n.id);
    incrementView(n.id);
  };

  const selected = notices.find((n) => n.id === selectedId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
          <path d="M18 14h-8" />
          <path d="M15 18h-6" />
          <path d="M10 6h8v4h-8V6z" />
        </svg>
        공지사항
      </button>

      {open && (
        <div
          className="fixed inset-0 top-14 z-[300] flex items-center justify-center bg-black/50 p-4 pt-6"
          onClick={() => {
            setOpen(false);
            setSelectedId(null);
          }}
        >
          <div
            className="flex max-h-[calc(100vh-8rem)] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-6">
              <h2 className="text-lg font-semibold text-gray-800">공지사항</h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSelectedId(null);
                }}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {!selected ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                {notices.length === 0 ? (
                  <p className="py-12 text-center text-sm text-gray-500">등록된 공지가 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {notices.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleItemClick(n)}
                        className="block w-full rounded-xl border border-gray-200 px-4 py-3 text-left transition hover:bg-gray-50"
                      >
                        <h3 className="font-medium text-gray-800">{n.title}</h3>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {new Date(n.created_at).toLocaleDateString("ko-KR")}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="shrink-0 border-b border-gray-100 px-4 py-3 sm:px-6">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="mb-1 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                    목록
                  </button>
                  <h2 className="text-lg font-semibold text-gray-800">{selected.title}</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
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
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
