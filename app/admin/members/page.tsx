"use client";

// profiles 테이블에 필요한 컬럼:
// - status: TEXT ('pending' | 'active') — 활성화 여부
// - created_at: TIMESTAMPTZ DEFAULT NOW() — 가입일

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

type Member = {
  user_id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  created_at: string;
};

const PAGE_SIZE_OPTIONS = [10, 20, 30];

export default function MembersPage() {
  const [ready, setReady] = useState(false); // 권한 확인 완료 여부
  const [members, setMembers] = useState<Member[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const initializedRef = useRef(false);

  // 권한 체크 + 첫 데이터 로드를 병렬로 실행
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      if (!session) {
        window.location.href = "/login";
        return;
      }

      const userId = session.user.id;
      const from = 0;
      const to = pageSize - 1;

      // role 확인 + 회원 목록 조회 동시 실행
      const [roleResult, membersResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("user_id, name, email, phone, status, created_at", { count: "exact" })
          .eq("role", "consumer")
          .order("created_at", { ascending: false })
          .range(from, to),
      ]);

      const role = roleResult.data?.role;
      if (role !== "admin" && role !== "super_admin") {
        window.location.href = "/login";
        return;
      }

      if (membersResult.error) {
        console.error("회원 조회 오류:", membersResult.error.message);
        setError(`조회 오류: ${membersResult.error.message}`);
      } else {
        setMembers(membersResult.data ?? []);
        setTotalCount(membersResult.count ?? 0);
      }

      setReady(true);
      setIsLoading(false);
    };

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMembers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("profiles")
        .select("user_id, name, email, phone, status, created_at", { count: "exact" })
        .eq("role", "consumer")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (appliedSearch.trim()) {
        const keyword = appliedSearch.trim();
        query = query.or(
          `name.ilike.%${keyword}%,email.ilike.%${keyword}%,phone.ilike.%${keyword}%`,
        );
      }

      const { data, count, error: fetchError } = await query;

      if (fetchError) {
        console.error("회원 조회 오류:", fetchError.message);
        setError(`조회 오류: ${fetchError.message}`);
      } else {
        setMembers(data ?? []);
        setTotalCount(count ?? 0);
      }
    } catch (err) {
      console.error("fetchMembers 예외:", err);
      setError("데이터를 불러오는 중 예기치 못한 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, appliedSearch]);

  // 검색/페이지 변경 시에만 재조회 (초기 로드 제외)
  useEffect(() => {
    if (!ready) return;
    fetchMembers();
  }, [ready, fetchMembers]);

  const handleSearch = () => {
    setCurrentPage(1);
    setAppliedSearch(search);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const toggleStatus = async (member: Member) => {
    const newStatus = member.status === "active" ? "pending" : "active";
    setTogglingId(member.user_id);

    setMembers((prev) =>
      prev.map((m) => m.user_id === member.user_id ? { ...m, status: newStatus } : m),
    );

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("user_id", member.user_id);

    if (updateError) {
      console.error("상태 변경 오류:", updateError);
      setMembers((prev) =>
        prev.map((m) => m.user_id === member.user_id ? { ...m, status: member.status } : m),
      );
    }

    setTogglingId(null);
  };

  const handleEmailClick = (userId: string) => {
    window.open(`/admin/impersonate?userId=${userId}`, "_blank");
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // 초기화 전 — 전체 스피너
  if (!ready && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">개인회원관리</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          가입한 개인 소비자 회원 목록입니다.
        </p>
      </div>

      {/* 검색 + 페이지당 개수 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="이름 / 이메일 / 전화번호 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-72"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            검색
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">페이지당</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 outline-none focus:border-indigo-400"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}개</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">전체 {totalCount}명</span>
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-500">{error}</div>
        ) : members.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {appliedSearch ? "검색 결과가 없습니다." : "등록된 회원이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500">
                  <th className="px-4 py-3">이름</th>
                  <th className="px-4 py-3">이메일</th>
                  <th className="hidden px-4 py-3 sm:table-cell">전화번호</th>
                  <th className="hidden px-4 py-3 md:table-cell">가입일</th>
                  <th className="px-4 py-3 text-center">시스템사용</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((member) => (
                  <tr key={member.user_id} className="transition hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {member.name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleEmailClick(member.user_id)}
                        className="text-indigo-600 underline-offset-2 hover:underline"
                      >
                        {member.email}
                      </button>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {member.phone ? <PhoneActions phone={member.phone} /> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="hidden px-4 py-3 text-gray-500 md:table-cell">
                      {member.created_at
                        ? new Date(member.created_at).toLocaleDateString("ko-KR")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <button
                          type="button"
                          disabled={togglingId === member.user_id}
                          onClick={() => toggleStatus(member)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50
                            ${member.status === "active" ? "bg-indigo-600" : "bg-gray-200"}`}
                          aria-label="활성화 토글"
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200
                              ${member.status === "active" ? "translate-x-5" : "translate-x-0"}`}
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            이전
          </button>

          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
              .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "..." ? (
                  <span key={`ellipsis-${idx}`} className="px-2 py-1.5 text-sm text-gray-400">…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCurrentPage(item as number)}
                    className={`min-w-[32px] rounded-lg border px-2 py-1.5 text-sm transition
                      ${currentPage === item
                        ? "border-indigo-600 bg-indigo-600 font-semibold text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                  >
                    {item}
                  </button>
                ),
              )}
          </div>

          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

function PhoneActions({ phone }: { phone: string }) {
  const digits = phone.replace(/\D/g, "");
  return (
    <div className="flex items-center gap-2">
      <a
        href={`tel:${digits}`}
        className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-200"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        {phone}
      </a>
      {/* 카카오톡 메시지 — 모바일 전용 */}
      <a
        href={`kakaotalk://msg/send?to=${digits}`}
        className="sm:hidden flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition"
        style={{ backgroundColor: "#FEE500", color: "#3A1D1D" }}
        title="카카오톡으로 메시지 보내기"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.477 2 2 5.805 2 10.5c0 2.91 1.69 5.484 4.28 7.084L5.25 21l4.2-2.1C10.268 19.29 11.12 19.5 12 19.5c5.523 0 10-3.805 10-8.5S17.523 2 12 2z" />
        </svg>
        카카오
      </a>
    </div>
  );
}
