"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import ProcessScheduleModal from "@/components/ProcessScheduleModal";

type ProcessTableItem = {
  id: string;
  title: string;
  status: string;
  start_date: string | null;
  move_in_date: string | null;
  process_schedule: Record<string, unknown> | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "대기중",
  publish_requested: "최종발행요청",
  estimate_waiting: "견적대기",
  active: "진행중",
  completed: "완료",
};

// 대기중(pending)만 수정 가능. 최종발행요청 이상은 수정 불가
const EDITABLE_STATUSES = new Set(["pending"]);

const CreateButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
    공정표 작성 +
  </button>
);

export default function ProcessTablePage() {
  const [showModal, setShowModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [list, setList] = useState<ProcessTableItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const initializedRef = useRef(false);

  const fetchList = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("projects")
      .select("id, title, status, start_date, move_in_date, process_schedule, created_at")
      .eq("user_id", uid)
      .not("process_schedule", "is", null)
      .order("created_at", { ascending: false });
    setList((data ?? []).filter((p) => p.process_schedule != null && Object.keys(p.process_schedule as object).length > 0));
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data?.session?.user?.id;
      if (uid) {
        setUserId(uid);
        fetchList(uid);
      }
      setIsLoading(false);
    };
    init();
  }, [fetchList]);

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—";

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">공정표작성</h1>
          <p className="mt-0.5 text-sm text-gray-500">공정표를 작성하고 관리합니다.</p>
        </div>
        <CreateButton onClick={() => { setEditProjectId(null); setShowModal(true); }} />
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-20 text-center">
          <p className="text-sm text-gray-500">등록된 공정표가 없습니다.</p>
          <div className="mt-6">
            <CreateButton onClick={() => { setEditProjectId(null); setShowModal(true); }} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <div key={p.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
                <span className="text-[11px] text-gray-400">{fmtDate(p.created_at)}</span>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm font-bold text-gray-900 line-clamp-2">{p.title || "제목 없음"}</p>
                <div className="mt-2 flex gap-3 text-xs text-gray-500">
                  <span>착공: {fmtDate(p.start_date)}</span>
                  <span>입주: {fmtDate(p.move_in_date)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setEditProjectId(p.id); setShowModal(true); }}
                  className={`mt-3 w-full rounded-xl border py-2 text-xs font-medium ${EDITABLE_STATUSES.has(p.status) ? "border-indigo-200 text-indigo-600 hover:bg-indigo-50" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  {EDITABLE_STATUSES.has(p.status) ? "수정하기" : "공정표 보기"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && userId && (
        <ProcessScheduleModal
          userId={userId}
          initialProjectId={editProjectId}
          onClose={() => { setShowModal(false); setEditProjectId(null); }}
          onSaved={() => { setShowModal(false); setEditProjectId(null); fetchList(userId); }}
        />
      )}
    </div>
  );
}
