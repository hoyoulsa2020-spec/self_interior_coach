"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

declare global {
  interface Window {
    daum: {
      Postcode: new (options: {
        oncomplete: (data: { roadAddress: string; jibunAddress: string }) => void;
      }) => { open: () => void };
    };
  }
}

type Profile = {
  user_id: string;
  name: string;
  business_name: string;
  owner_name: string;
  phone: string;
  business_number: string;
  business_license_url: string;
  address1: string;
  address2: string;
  category: unknown;
  work_zone: unknown;
  introduction: string;
  warranty_period: string | null;
  status: string;
  onboarding_completed: boolean;
  badges: string[];
  created_at: string;
};

type EditForm = {
  business_name: string;
  owner_name: string;
  phone: string;
  address1: string;
  address2: string;
  category: string[];
  work_zone: string[];
  introduction: string;
  warranty_period: string;
};

const BADGES = [
  { id: "sellin_certified",  label: "셀인코치인증",  bg: "bg-blue-50",   color: "text-blue-700",   border: "border-blue-200",  dot: "bg-blue-500"   },
  { id: "consumer_verified", label: "소비자인증",    bg: "bg-yellow-50", color: "text-yellow-700", border: "border-yellow-200", dot: "bg-yellow-400" },
  { id: "warranty_best",     label: "하자보수우수",  bg: "bg-red-50",    color: "text-red-700",    border: "border-red-200",    dot: "bg-red-500"    },
  { id: "good_comm",         label: "소통원활",      bg: "bg-green-50",  color: "text-green-700",  border: "border-green-200",  dot: "bg-green-500"  },
];

const WORK_ZONES = [
  "전국", "서울 전체", "인천 전체", "경기 전체",
  "충북 전체", "충남 전체", "경북 전체", "경남 전체",
  "전북 전체", "전남 전체", "제주도", "그 외 섬지역",
];

function toArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function formatPhone(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function ProviderProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [form, setForm] = useState<EditForm>({
    business_name: "", owner_name: "", phone: "",
    address1: "", address2: "", category: [], work_zone: [], introduction: "",
  });

  // 사업자등록증 업로드
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const licenseInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) { window.location.href = "/login"; return; }

      const [profileRes, catRes] = await Promise.all([
        supabase.from("profiles")
          .select("user_id, name, business_name, owner_name, phone, business_number, business_license_url, address1, address2, category, work_zone, introduction, warranty_period, status, onboarding_completed, badges, created_at, role")
          .eq("user_id", session.user.id).maybeSingle(),
        supabase.from("category").select("name").order("sort_order", { ascending: true }).order("id", { ascending: true }),
      ]);

      if (!profileRes.data || profileRes.data.role !== "provider") {
        window.location.href = "/login"; return;
      }
      setProfile(profileRes.data as Profile);
      setAvailableCategories((catRes.data ?? []).map((r: { name: string }) => r.name).filter(Boolean));
      setIsLoading(false);
    };
    init();

    // 다음 주소 스크립트 로드
    if (!document.querySelector('script[src*="postcode.v2.js"]')) {
      const s = document.createElement("script");
      s.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      document.head.appendChild(s);
    }
  }, []);

  const startEdit = () => {
    if (!profile) return;
    setForm({
      business_name: profile.business_name || "",
      owner_name: profile.owner_name || "",
      phone: profile.phone || "",
      address1: profile.address1 || "",
      address2: profile.address2 || "",
      category: toArray(profile.category),
      work_zone: toArray(profile.work_zone),
      introduction: profile.introduction || "",
      warranty_period: profile.warranty_period || "",
    });
    setLicenseFile(null);
    setSaveError(null);
    setSaveSuccess(false);
    setIsEditing(true);
  };

  const openPostcode = () => {
    if (!window.daum?.Postcode) return;
    new window.daum.Postcode({
      oncomplete: (data) => {
        setForm((f) => ({ ...f, address1: data.roadAddress || data.jibunAddress, address2: "" }));
      },
    }).open();
  };

  const toggleCategory = (cat: string) => {
    setForm((f) => ({
      ...f,
      category: f.category.includes(cat) ? f.category.filter((c) => c !== cat) : [...f.category, cat],
    }));
  };

  const toggleZone = (zone: string) => {
    setForm((f) => {
      if (zone === "전국") {
        // 전국 선택 시 나머지 모두 해제, 전국만 선택
        return { ...f, work_zone: f.work_zone.includes("전국") ? [] : ["전국"] };
      }
      // 다른 지역 선택 시 전국 해제
      const without = f.work_zone.filter((z) => z !== "전국");
      return {
        ...f,
        work_zone: without.includes(zone) ? without.filter((z) => z !== zone) : [...without, zone],
      };
    });
  };

  const saveProfile = async () => {
    if (!profile) return;
    setSaveError(null);
    setIsSaving(true);

    let licenseUrl = profile.business_license_url;

    if (licenseFile) {
      const ext = licenseFile.name.split(".").pop();
      const path = `licenses/${profile.user_id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("business-licenses").upload(path, licenseFile, { upsert: true });
      if (uploadErr) { setSaveError(`파일 업로드 오류: ${uploadErr.message}`); setIsSaving(false); return; }
      const { data: urlData } = supabase.storage.from("business-licenses").getPublicUrl(path);
      licenseUrl = urlData.publicUrl;
    }

    const { error } = await supabase.from("profiles").update({
      business_name: form.business_name.trim(),
      owner_name: form.owner_name.trim(),
      phone: form.phone.trim(),
      address1: form.address1.trim(),
      address2: form.address2.trim(),
      category: form.category,
      work_zone: form.work_zone,
      introduction: form.introduction.trim(),
      warranty_period: form.warranty_period.trim() || null,
      business_license_url: licenseUrl,
    }).eq("user_id", profile.user_id);

    if (error) { setSaveError(error.message); setIsSaving(false); return; }

    setProfile((prev) => prev ? {
      ...prev,
      business_name: form.business_name.trim(),
      owner_name: form.owner_name.trim(),
      phone: form.phone.trim(),
      address1: form.address1.trim(),
      address2: form.address2.trim(),
      category: form.category,
      work_zone: form.work_zone,
      introduction: form.introduction.trim(),
      warranty_period: form.warranty_period.trim() || null,
      business_license_url: licenseUrl,
    } : prev);

    setIsSaving(false);
    setIsEditing(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }
  if (!profile) return null;

  const categories = toArray(profile.category);
  const zones = toArray(profile.work_zone);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">업체 정보</h1>
          <p className="mt-0.5 text-sm text-gray-500">등록된 업체 정보를 확인하고 수정합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${
            profile.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
          }`}>
            {profile.status === "active" ? "활성" : "비활성"}
          </span>
          {!isEditing && (
            <button type="button" onClick={startEdit}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-600 transition hover:bg-indigo-100">
              정보 수정
            </button>
          )}
        </div>
      </div>

      {saveSuccess && (
        <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">정보가 저장됐습니다.</div>
      )}

      {!isEditing ? (
        /* ── 보기 모드 ── */
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">기본 정보</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow label="업체명" value={profile.business_name} />
              <InfoRow label="대표자명" value={profile.owner_name} />
              <InfoRow label="연락처" value={profile.phone} />
              <InfoRow label="사업자등록번호" value={profile.business_number} />
              <InfoRow label="가입일" value={new Date(profile.created_at).toLocaleDateString("ko-KR")} />
              <InfoRow label="온보딩" value={profile.onboarding_completed ? "완료" : "미완료"} />
              <InfoRow label="하자보증기간" value={profile.warranty_period ? `${profile.warranty_period}개월` : null} />
            </div>
            {/* 보유 뱃지 */}
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="mb-2 text-xs text-gray-500">보유 뱃지</p>
              {toArray(profile.badges).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {toArray(profile.badges).map((bid) => {
                    const badge = BADGES.find((b) => b.id === bid);
                    if (!badge) return null;
                    return (
                      <span key={bid} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${badge.bg} ${badge.color} ${badge.border}`}>
                        <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
                        {badge.label}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">보유 뱃지 없음</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">사업장 주소</h2>
            <div className="space-y-3">
              <InfoRow label="기본주소" value={profile.address1} />
              <InfoRow label="상세주소" value={profile.address2} />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">전문분야 & 시공지역</h2>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs text-gray-500">전문분야</p>
                {categories.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((c) => (
                      <span key={c} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">{c}</span>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-400">—</p>}
              </div>
              <div>
                <p className="mb-1.5 text-xs text-gray-500">시공가능지역</p>
                {zones.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {zones.map((z) => (
                      <span key={z} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{z}</span>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-400">—</p>}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">업체 소개</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{profile.introduction || "—"}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">사업자등록증</h2>
            {profile.business_license_url ? (
              <a href={profile.business_license_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-100">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                사업자등록증 보기
              </a>
            ) : <p className="text-sm text-gray-400">—</p>}
          </div>
        </div>
      ) : (
        /* ── 수정 모드 ── */
        <div className="space-y-4">
          {/* 기본 정보 수정 */}
          <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">기본 정보</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">업체명</label>
                <input type="text" value={form.business_name}
                  onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">대표자명</label>
                <input type="text" value={form.owner_name}
                  onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">연락처</label>
                <input type="text" value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">사업자등록번호 (변경 불가)</label>
                <input type="text" value={profile.business_number || "—"} disabled
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-400" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-gray-500">하자보증기간 <span className="text-gray-300">(선택)</span></label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" value={form.warranty_period}
                    placeholder="예) 12"
                    onChange={(e) => setForm((f) => ({ ...f, warranty_period: e.target.value.replace(/[^0-9]/g, "") }))}
                    className="w-32 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                  <span className="text-sm text-gray-500">개월</span>
                </div>
              </div>
            </div>
          </div>

          {/* 주소 수정 */}
          <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">사업장 주소</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">기본주소</label>
                <div className="flex gap-2">
                  <input type="text" value={form.address1} readOnly placeholder="주소 검색 버튼을 눌러주세요"
                    className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none" />
                  <button type="button" onClick={openPostcode}
                    className="shrink-0 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700">
                    주소 검색
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">상세주소</label>
                <input type="text" value={form.address2} placeholder="상세주소를 입력하세요"
                  onChange={(e) => setForm((f) => ({ ...f, address2: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </div>
            </div>
          </div>

          {/* 전문분야 */}
          <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">전문분야</h2>
            <div className="flex flex-wrap gap-2">
              {availableCategories.map((cat) => (
                <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    form.category.includes(cat)
                      ? "border-indigo-500 bg-indigo-500 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300"
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* 시공지역 */}
          <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">시공가능지역</h2>
            <div className="flex flex-wrap gap-2">
              {WORK_ZONES.map((zone) => (
                <button key={zone} type="button" onClick={() => toggleZone(zone)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    form.work_zone.includes(zone)
                      ? "border-indigo-500 bg-indigo-500 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300"
                  }`}>
                  {zone}
                </button>
              ))}
            </div>
          </div>

          {/* 업체 소개 */}
          <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">업체 소개</h2>
            <textarea value={form.introduction} rows={5} placeholder="업체 소개를 입력하세요"
              onChange={(e) => setForm((f) => ({ ...f, introduction: e.target.value }))}
              className="w-full resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          </div>

          {/* 사업자등록증 */}
          <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">사업자등록증</h2>
            {profile.business_license_url && !licenseFile && (
              <div className="mb-3 flex items-center gap-2">
                <a href={profile.business_license_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:underline">현재 파일 보기</a>
                <span className="text-xs text-gray-400">· 새 파일을 선택하면 교체됩니다</span>
              </div>
            )}
            {licenseFile && (
              <p className="mb-2 text-xs text-indigo-600">선택된 파일: {licenseFile.name}</p>
            )}
            <button type="button" onClick={() => licenseInputRef.current?.click()}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              파일 선택
            </button>
            <input ref={licenseInputRef} type="file" accept="image/*,.pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setLicenseFile(f); e.target.value = ""; }} />
          </div>

          {saveError && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{saveError}</p>
          )}

          {/* 저장/취소 버튼 */}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsEditing(false)} disabled={isSaving}
              className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              취소
            </button>
            <button type="button" onClick={saveProfile} disabled={isSaving}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {isSaving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-800">{value || "—"}</p>
    </div>
  );
}
