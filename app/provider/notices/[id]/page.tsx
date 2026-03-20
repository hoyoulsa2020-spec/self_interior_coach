"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Notice = {
  id: string;
  title: string;
  content: string;
  image_urls?: string[] | null;
  created_at: string;
  view_count?: number;
};

export default function ProviderNoticeDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data, error } = await supabase
        .from("notices")
        .select("id, title, content, image_urls, created_at")
        .eq("id", id)
        .eq("target_audience", "provider")
        .maybeSingle();
      if (error || !data) {
        setNotice(null);
      } else {
        setNotice(data as Notice);
        await supabase.rpc("increment_notice_view", { nid: id });
      }
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!notice) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">공지를 찾을 수 없습니다.</p>
        <Link href="/provider/notices" className="text-sm font-medium text-indigo-600 hover:underline">
          목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href="/provider/notices"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-800"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        목록으로
      </Link>

      <article className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-4 sm:px-6">
          <h1 className="text-lg font-semibold text-gray-800 sm:text-xl">{notice.title}</h1>
          <p className="mt-1 text-xs text-gray-500">
            {new Date(notice.created_at).toLocaleDateString("ko-KR")}
          </p>
        </div>
        <div className="px-4 py-4 sm:px-6">
          <div
            className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_a]:text-indigo-600 [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4"
            dangerouslySetInnerHTML={{ __html: notice.content }}
          />
          {(notice.image_urls?.length ?? 0) > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {notice.image_urls!.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="max-h-48 rounded-lg object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
