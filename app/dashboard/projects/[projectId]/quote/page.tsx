"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { normalizeWorkTreeGroup } from "@/lib/workTreeLabels";
import { formatArea } from "@/lib/area";

type WorkTreeItem = { cat: string; subs: string[] };
type WorkDetail = { requirements: string; image_urls: string[]; subs?: string[] };

type ProjectRow = {
  id: string;
  title: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  site_address1: string | null;
  site_address2: string | null;
  work_tree: WorkTreeItem[] | null;
  work_details: Record<string, WorkDetail> | null;
  start_date: string | null;
  move_in_date: string | null;
  supply_area_m2: number | null;
  exclusive_area_m2: number | null;
  is_expanded: boolean | null;
  created_at: string;
};

type EstimateRow = {
  provider_id: string;
  provider_business_name: string | null;
  amounts: Record<string, number>;
};

type AssignmentRow = {
  category: string;
  provider_id: string;
  match_status: string | null;
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function SelinSeal({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative flex h-[104px] w-[104px] shrink-0 items-center justify-center ${className}`}
      aria-hidden
    >
      <div
        className="absolute inset-0 rounded-full border-[3px] border-indigo-400/90 bg-gradient-to-br from-white to-indigo-50 shadow-[0_8px_30px_rgba(99,102,241,0.25)]"
        style={{ transform: "rotate(-8deg)" }}
      />
      <div
        className="absolute inset-[5px] rounded-full border border-dashed border-indigo-300/80"
        style={{ transform: "rotate(-8deg)" }}
      />
      <div
        className="relative z-[1] flex h-[78px] w-[78px] flex-col items-center justify-center rounded-full bg-gradient-to-b from-indigo-600 to-violet-700 text-center text-[9px] font-bold leading-tight text-white shadow-inner ring-2 ring-white/30"
        style={{ transform: "rotate(-8deg)" }}
      >
        <span className="text-[10px] tracking-tight">셀인코치</span>
        <span className="mt-0.5 text-[11px] tracking-widest">인증</span>
        <span className="mt-1 text-[7px] font-medium opacity-90">공정·견적</span>
      </div>
    </div>
  );
}

export default function ProjectQuotePrintPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.projectId as string;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, AssignmentRow>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) {
      router.replace("/login");
      return;
    }
    const { data: p, error: pe } = await supabase
      .from("projects")
      .select(
        "id, title, contact_name, contact_phone, contact_email, site_address1, site_address2, work_tree, work_details, start_date, move_in_date, supply_area_m2, exclusive_area_m2, is_expanded, created_at"
      )
      .eq("id", projectId)
      .eq("user_id", uid)
      .maybeSingle();
    if (pe || !p) {
      setErr(pe?.message ?? "프로젝트를 찾을 수 없습니다.");
      setLoading(false);
      return;
    }
    setProject(p as ProjectRow);

    const { data: estData } = await supabase
      .from("project_estimates")
      .select("provider_id, amounts, provider_business_name")
      .eq("project_id", projectId);
    setEstimates(
      (estData ?? []).map((r) => ({
        provider_id: r.provider_id,
        provider_business_name: r.provider_business_name,
        amounts: (r.amounts as Record<string, number>) ?? {},
      }))
    );

    const { data: asn } = await supabase
      .from("project_category_assignments")
      .select("category, provider_id, match_status")
      .eq("project_id", projectId);
    const map: Record<string, AssignmentRow> = {};
    (asn ?? []).forEach((row) => {
      map[row.category] = {
        category: row.category,
        provider_id: row.provider_id,
        match_status: row.match_status,
      };
    });
    setAssignments(map);
    setLoading(false);
  }, [projectId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gradient-to-b from-violet-50/80 to-white">
        <div className="flex items-center gap-2 text-sm text-indigo-600">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          불러오는 중…
        </div>
      </div>
    );
  }

  if (err || !project) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-red-600">{err ?? "오류"}</p>
        <Link href="/dashboard/projects" className="mt-4 inline-block text-sm font-medium text-indigo-600 underline">
          내 프로젝트로
        </Link>
      </div>
    );
  }

  let groups: WorkTreeItem[] = (project.work_tree ?? []).map((g) => normalizeWorkTreeGroup(g));
  if (groups.length === 0 && project.work_details) {
    const cats = Object.keys(project.work_details);
    groups = cats.map((cat) =>
      normalizeWorkTreeGroup({
        cat,
        subs: (project.work_details![cat] as WorkDetail).subs ?? [],
      })
    );
  }

  type Line = {
    cat: string;
    sub: string | null;
    amount: number | null;
    amountNote: string;
    providerHint: string | null;
    /** single: 대공정만 / groupHeader: 하위가 있을 때 대공정 제목 한 줄 / subRow: 하위공정만 / subtotal: ○○ 소계 */
    lineKind: "single" | "groupHeader" | "subRow" | "subtotal";
  };

  const lines: Line[] = [];
  for (const g of groups) {
    const asn = assignments[g.cat];
    const pickAmountForCat = (): { amount: number | null; note: string; provider: string | null } => {
      if (asn && (asn.match_status === "completed" || asn.match_status === "in_progress")) {
        const est = estimates.find((e) => e.provider_id === asn.provider_id);
        const raw = est?.amounts[g.cat];
        if (raw != null && raw >= 0) {
          return {
            amount: raw,
            note: asn.match_status === "completed" ? "선택 업체 기준" : "진행 중 업체 기준",
            provider: est?.provider_business_name ?? null,
          };
        }
      }
      const bids = estimates
        .map((e) => e.amounts[g.cat])
        .filter((n): n is number => n != null && n >= 0);
      if (bids.length > 0) {
        return {
          amount: Math.min(...bids),
          note: "입찰 중 최저 참고",
          provider: null,
        };
      }
      return { amount: null, note: "", provider: null };
    };

    const { amount: catAmt, note: catNote, provider: catProv } = pickAmountForCat();

    if (g.subs.length === 0) {
      lines.push({
        cat: g.cat,
        sub: null,
        amount: catAmt,
        amountNote: catNote,
        providerHint: catProv,
        lineKind: "single",
      });
    } else {
      lines.push({
        cat: g.cat,
        sub: null,
        amount: null,
        amountNote: "",
        providerHint: null,
        lineKind: "groupHeader",
      });
      g.subs.forEach((sub) => {
        lines.push({
          cat: "",
          sub,
          amount: null,
          amountNote: "",
          providerHint: null,
          lineKind: "subRow",
        });
      });
      lines.push({
        cat: `${g.cat} 소계`,
        sub: null,
        amount: catAmt,
        amountNote: catNote,
        providerHint: catProv,
        lineKind: "subtotal",
      });
    }
  }

  const total = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const hasAnyAmount = lines.some((l) => l.amount != null);

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-violet-100/40 via-fuchsia-50/30 to-white pb-16 print:bg-white print:pb-0">
      {/* 화면 전용 툴바 */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100/80 bg-white/90 px-3 py-2.5 backdrop-blur-md sm:gap-3 sm:px-4 sm:py-3 print:hidden">
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          내 프로젝트
        </Link>
        <div className="hidden flex-wrap gap-2 sm:flex">
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-300/40 transition hover:opacity-95"
          >
            인쇄 / PDF 저장
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl min-w-0 px-3 py-6 sm:px-4 sm:py-8 print:max-w-none print:px-0 print:py-0">
        <article className="min-w-0 overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-xl shadow-indigo-100/50 ring-1 ring-indigo-100/80 sm:rounded-[2rem] print:rounded-none print:border-0 print:shadow-none print:ring-0">
          {/* 헤더 */}
          <header className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 px-4 pb-8 pt-8 text-white sm:px-8 sm:pb-10 sm:pt-10 print:from-white print:via-white print:to-white print:text-gray-900 print:pb-8 print:pt-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl print:hidden" />
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80 sm:text-xs sm:tracking-[0.2em] print:text-indigo-600">
                  셀인코치 · 견적 요약
                </p>
                <h1 className="break-words text-xl font-bold tracking-tight sm:text-2xl md:text-3xl print:text-2xl">
                  {project.title || "프로젝트"}
                </h1>
                <p className="text-sm text-white/85 print:text-gray-600">
                  고객님이 선택하신 공정과 금액을 한 장으로 정리했습니다.
                </p>
              </div>
              <SelinSeal className="mx-auto shrink-0 scale-[0.88] sm:mx-0 sm:scale-100 print:border-indigo-300" />
            </div>
          </header>

          {/* 메타 정보 — 부드러운 카드 */}
          <section className="space-y-4 px-4 py-5 sm:px-8 sm:py-6 print:px-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50/90 to-white px-4 py-3 print:border-gray-200 print:bg-gray-50">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500/90">현장</p>
                <p className="mt-1 break-words text-sm font-medium text-gray-800">
                  {project.site_address1 || "—"}
                  {project.site_address2 ? ` ${project.site_address2}` : ""}
                </p>
              </div>
              <div className="rounded-2xl border border-violet-100/80 bg-gradient-to-br from-violet-50/80 to-white px-4 py-3 print:border-gray-200 print:bg-gray-50">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600/90">일정</p>
                <p className="mt-1 text-sm font-medium text-gray-800">
                  {fmtDate(project.start_date)} → {fmtDate(project.move_in_date)}
                </p>
              </div>
              <div className="rounded-2xl border border-fuchsia-100/70 bg-gradient-to-br from-fuchsia-50/60 to-white px-4 py-3 print:border-gray-200 print:bg-gray-50">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-600/90">면적</p>
                <p className="mt-1 text-sm font-medium text-gray-800">
                  {project.supply_area_m2 != null ? `공급 ${formatArea(project.supply_area_m2)}` : "—"}
                  {project.exclusive_area_m2 != null ? ` · 전용 ${formatArea(project.exclusive_area_m2)}` : ""}
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 print:border-gray-200 print:bg-gray-50">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">의뢰인</p>
                <p className="mt-1 break-words text-sm font-medium text-gray-800">
                  {[project.contact_name, project.contact_phone].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
            </div>
          </section>

          {/* 공정 표 */}
          <section className="px-4 pb-5 sm:px-8 sm:pb-6 print:px-0">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-gray-900 sm:mb-4 sm:text-lg">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xs text-white shadow-md sm:h-8 sm:w-8 sm:text-sm print:bg-gray-800">
                ✦
              </span>
              공정별 금액
            </h2>

            <div className="-mx-1 overflow-x-auto rounded-2xl border border-indigo-100/60 bg-white/50 sm:mx-0 print:overflow-visible print:border-gray-300">
              <table className="w-full min-w-[280px] table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-indigo-50/90 to-violet-50/50 text-left text-[11px] font-semibold uppercase tracking-wide text-indigo-800/90 sm:text-xs print:bg-gray-100 print:text-gray-700">
                    <th className="w-[46%] px-2 py-2.5 sm:w-auto sm:px-4 sm:py-3">공정</th>
                    <th className="hidden w-[30%] px-4 py-3 sm:table-cell">비고</th>
                    <th className="w-[54%] px-2 py-2.5 text-right sm:w-auto sm:px-4 sm:py-3">금액 (원)</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <>
                      <tr className="sm:hidden print:hidden">
                        <td colSpan={2} className="px-3 py-8 text-center text-sm text-gray-500">
                          등록된 대공정이 없습니다. 프로젝트에서 공정을 먼저 입력해 주세요.
                        </td>
                      </tr>
                      <tr className="hidden sm:table-row print:table-row">
                        <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                          등록된 대공정이 없습니다. 프로젝트에서 공정을 먼저 입력해 주세요.
                        </td>
                      </tr>
                    </>
                  ) : (
                    lines.map((row, i) => (
                      <tr
                        key={`quote-line-${i}`}
                        className="border-t border-indigo-50/80 odd:bg-white/80 even:bg-indigo-50/20 print:border-gray-200 print:even:bg-transparent"
                      >
                        <td className="min-w-0 px-2 py-2.5 align-top text-gray-800 sm:px-4 sm:py-3">
                          {row.lineKind === "groupHeader" && (
                            <span className="break-words text-base font-semibold text-gray-900">{row.cat}</span>
                          )}
                          {row.lineKind === "single" && (
                            <span className="break-words font-medium">{row.cat}</span>
                          )}
                          {row.lineKind === "subRow" && row.sub && (
                            <span className="block border-l-[3px] border-indigo-200/90 pl-3 text-sm font-normal leading-snug text-gray-700 max-sm:border-l-2 max-sm:pl-2.5 max-sm:py-0.5 max-sm:text-[11px] max-sm:leading-snug max-sm:text-gray-600">
                              {row.sub}
                            </span>
                          )}
                          {row.lineKind === "subtotal" && (
                            <span className="break-words font-semibold text-indigo-950">{row.cat}</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-gray-500 sm:table-cell">
                          {row.lineKind === "groupHeader" || row.lineKind === "subRow" ? (
                            "—"
                          ) : (
                            [row.amountNote, row.providerHint].filter(Boolean).join(" · ") || "—"
                          )}
                        </td>
                        <td className="min-w-0 px-2 py-2.5 text-right align-top text-sm font-semibold tabular-nums text-indigo-900 sm:px-4 sm:py-3 print:text-gray-900">
                          {row.amount != null ? (
                            <div className="inline-block max-w-full text-right">
                              <span className="whitespace-nowrap">{row.amount.toLocaleString("ko-KR")}</span>
                              {([row.amountNote, row.providerHint].filter(Boolean).join(" · ") || "") !== "" && (
                                <span className="mt-1 block text-[10px] font-normal leading-snug text-gray-500 print:hidden sm:hidden">
                                  {[row.amountNote, row.providerHint].filter(Boolean).join(" · ")}
                                </span>
                              )}
                            </div>
                          ) : row.lineKind === "groupHeader" ? (
                            <span className="text-xs font-normal text-gray-300">—</span>
                          ) : (
                            <span className="font-normal text-gray-400">협의</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {hasAnyAmount && (
                  <tfoot>
                    {/* 모바일: 비고 열이 display:none 이라 열 수가 2개 — colspan 2 푸터가 깨지므로 별도 행 */}
                    <tr className="border-t-2 border-indigo-200/80 bg-gradient-to-r from-indigo-50 to-violet-50 font-bold sm:hidden print:hidden">
                      <td className="px-3 py-3 text-left text-sm text-indigo-950">합계 (표시된 금액 기준)</td>
                      <td className="px-3 py-3 text-right text-base tabular-nums text-indigo-950">
                        {total.toLocaleString("ko-KR")}
                      </td>
                    </tr>
                    <tr className="hidden border-t-2 border-indigo-200/80 bg-gradient-to-r from-indigo-50 to-violet-50 font-bold print:table-row sm:table-row print:border-gray-400 print:bg-gray-100">
                      <td colSpan={2} className="px-4 py-4 text-indigo-950 print:text-gray-900">
                        합계 (표시된 금액 기준)
                      </td>
                      <td className="px-4 py-4 text-right text-lg tabular-nums text-indigo-950 print:text-gray-900">
                        {total.toLocaleString("ko-KR")}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          <footer className="border-t border-indigo-100/80 bg-gradient-to-b from-transparent to-slate-50/80 px-4 py-5 text-center sm:px-8 sm:py-6 print:border-gray-200 print:bg-white">
            <p className="text-[11px] leading-relaxed text-gray-500">
              본 문서는 셀인코치에 등록된 프로젝트 정보를 바탕으로 한 <strong className="text-gray-600">참고용 요약</strong>입니다.
              <br className="hidden sm:inline" /> 실제 계약·공사비는 업체와의 최종 견적서 및 계약서를 기준으로 하시기 바랍니다.
            </p>
            <p className="mt-3 text-[10px] text-gray-400">© {new Date().getFullYear()} 셀인코치 · 인증 마크는 플랫폼 내 표시용입니다.</p>
          </footer>
        </article>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            margin: 14mm 12mm;
            size: A4;
          }
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}
