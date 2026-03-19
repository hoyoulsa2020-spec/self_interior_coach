"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const WORK_ZONES = [
  "전국",
  "서울 전체",
  "인천 전체",
  "경기 전체",
  "충북 전체",
  "충남 전체",
  "경북 전체",
  "경남 전체",
  "전북 전체",
  "전남 전체",
  "제주도",
  "그 외 섬지역",
];

export default function ProviderOnboardingPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [licensePreviewUrl, setLicensePreviewUrl] = useState<string | null>(null);
  const [existingLicenseUrl, setExistingLicenseUrl] = useState<string | null>(null);
  const [businessVerified, setBusinessVerified] = useState(false);
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [introduction, setIntroduction] = useState("");
  const [phone, setPhone] = useState("");
  const [warrantyPeriod, setWarrantyPeriod] = useState("");

  useEffect(() => {
    const loadProfile = async (userId: string) => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, business_name, owner_name, business_number, business_license_url, business_verified, address1, address2, category, work_zone, introduction, phone, warranty_period")
        .eq("user_id", userId)
        .maybeSingle();

      if (profileError) {
        console.error("Profile 조회 오류:", profileError);
        window.location.href = "/login";
        return;
      }

      if (profile?.role !== "provider") {
        window.location.href = "/dashboard";
        return;
      }

      // category 테이블에서 전문분야 목록 불러오기
      const { data: categories } = await supabase
        .from("category")
        .select("name")
        .order("id");
      setCategoryOptions(categories?.map((c) => c.name).filter((n) => n?.trim()) ?? []);

      setUserId(userId);
      setBusinessName(profile.business_name ?? "");
      setOwnerName(profile.owner_name ?? "");
      setBusinessNumber(profile.business_number ?? "");
      setExistingLicenseUrl(profile.business_license_url ?? null);
      setBusinessVerified(profile.business_verified ?? false);
      setAddress1(profile.address1 ?? "");
      setAddress2(profile.address2 ?? "");
      setSelectedCategories(
        profile.category ? profile.category.split(",").map((c: string) => c.trim()) : [],
      );
      setSelectedZones(
        profile.work_zone ? profile.work_zone.split(",").map((z: string) => z.trim()) : [],
      );
      setIntroduction(profile.introduction ?? "");
      setPhone(profile.phone ?? "");
      setWarrantyPeriod(profile.warranty_period ?? "");
      setIsPageLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        if (!session) {
          window.location.href = "/login";
          return;
        }
        loadProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const openAddressSearch = () => {
    const script = document.getElementById("daum-postcode");
    const launch = () => {
      const daum = window.daum;
      if (!daum?.Postcode) return;
      new daum.Postcode({
        oncomplete: (data) => {
          setAddress1(data.roadAddress || data.jibunAddress || "");
          setAddress2("");
        },
      }).open();
    };

    if (!script) {
      const s = document.createElement("script");
      s.id = "daum-postcode";
      s.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      s.onload = launch;
      document.head.appendChild(s);
    } else {
      launch();
    }
  };

  const toggleZone = (zone: string) => {
    if (zone === "전국") {
      setSelectedZones((prev) =>
        prev.includes("전국") ? [] : ["전국"],
      );
      return;
    }
    setSelectedZones((prev) => {
      const withoutAll = prev.filter((z) => z !== "전국");
      return withoutAll.includes(zone)
        ? withoutAll.filter((z) => z !== zone)
        : [...withoutAll, zone];
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!businessName.trim()) { setError("업체명을 입력해주세요."); return; }
    if (!ownerName.trim()) { setError("대표자명을 입력해주세요."); return; }
    if (!address1.trim()) { setError("사업장 소재지를 입력해주세요."); return; }
    if (selectedCategories.length === 0) { setError("전문분야를 1개 이상 선택해주세요."); return; }
    if (selectedZones.length === 0) { setError("시공가능지역을 1개 이상 선택해주세요."); return; }

    setIsSaving(true);

    let licenseUrl = existingLicenseUrl;

    if (licenseFile) {
      const ext = licenseFile.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("business-licenses")
        .upload(path, licenseFile, { upsert: true });

      if (uploadError) {
        console.error("파일 업로드 오류:", uploadError);
        setError("파일 업로드 중 오류가 발생했습니다. 다시 시도해주세요.");
        setIsSaving(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("business-licenses")
        .getPublicUrl(path);
      licenseUrl = urlData.publicUrl;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        business_name: businessName.trim(),
        owner_name: ownerName.trim(),
        business_number: businessNumber.trim(),
        business_license_url: licenseUrl,
        business_verified: businessVerified,
        address1: address1.trim(),
        address2: address2.trim(),
        category: selectedCategories.join(", "),
        work_zone: selectedZones.join(", "),
        introduction: introduction.trim(),
        phone: phone.trim(),
        warranty_period: warrantyPeriod.trim() || null,
        onboarding_completed: true,
      })
      .eq("user_id", userId);

    setIsSaving(false);

    if (updateError) {
      console.error("저장 오류:", updateError);
      setError("저장 중 오류가 발생했습니다. 다시 시도해주세요.");
      return;
    }

    window.location.href = "/provider/dashboard";
  };

  if (isPageLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">셀인코치</span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition hover:bg-gray-50 active:bg-gray-100"
          >
            로그아웃
          </button>
        </div>

        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            업체 정보 등록
          </h1>
          <p className="mt-2 text-sm text-foreground/70">
            서비스 이용을 위해 업체 정보를 입력해주세요.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 기본 정보 */}
          <section className="rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/5 px-5 py-6 sm:px-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">기본 정보</h2>

            <Field label="업체명" required>
              <input
                type="text"
                placeholder="업체명을 입력하세요"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="대표자명" required>
              <input
                type="text"
                placeholder="대표자명을 입력하세요"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="연락처">
              <input
                type="tel"
                inputMode="tel"
                placeholder="010-1234-5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="사업장 소재지" required>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  placeholder="주소 검색 버튼을 눌러주세요"
                  value={address1}
                  className={`${inputClass} flex-1 cursor-pointer bg-gray-100`}
                  onClick={openAddressSearch}
                />
                <button
                  type="button"
                  onClick={openAddressSearch}
                  className="shrink-0 rounded-xl border border-indigo-500 px-3.5 py-2.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 active:bg-indigo-100"
                >
                  주소 검색
                </button>
              </div>
              {address1 && (
                <input
                  type="text"
                  placeholder="상세 주소 입력 (동/호수 등)"
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                  className={`${inputClass} mt-2`}
                />
              )}
            </Field>
          </section>

          {/* 사업자 정보 */}
          <section className="rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/5 px-5 py-6 sm:px-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">사업자 정보</h2>

            <Field label="사업자등록번호">
              <input
                type="text"
                inputMode="numeric"
                placeholder="000-00-00000"
                value={businessNumber}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                  let formatted = digits;
                  if (digits.length > 5) {
                    formatted = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
                  } else if (digits.length > 3) {
                    formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                  }
                  setBusinessNumber(formatted);
                }}
                className={inputClass}
              />
            </Field>

            <Field label="사업자 등록증 첨부">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-5 transition hover:border-indigo-400 hover:bg-indigo-50">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setLicenseFile(file);
                    if (file && file.type.startsWith("image/")) {
                      setLicensePreviewUrl(URL.createObjectURL(file));
                    } else {
                      setLicensePreviewUrl(null);
                    }
                  }}
                />
                {licensePreviewUrl ? (
                  <img src={licensePreviewUrl} alt="미리보기" className="max-h-40 rounded-lg object-contain" />
                ) : existingLicenseUrl ? (
                  <img src={existingLicenseUrl} alt="기존 첨부파일" className="max-h-40 rounded-lg object-contain" />
                ) : (
                  <>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className="text-xs text-gray-500">이미지 또는 PDF 첨부</span>
                  </>
                )}
                <span className="text-xs text-indigo-500 font-medium">
                  {licenseFile ? licenseFile.name : "파일 선택하기"}
                </span>
              </label>
            </Field>

            <Field label="사업자 지속 여부">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={businessVerified}
                  onChange={(e) => setBusinessVerified(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
                />
                <span className="text-sm text-gray-700">
                  현재 사업을 운영 중입니다
                </span>
              </label>
            </Field>
          </section>

          {/* 전문분야 */}
          <section className="rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/5 px-5 py-6 sm:px-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">전문분야 / 시공지역</h2>

            <Field label="전문분야" required>
              {categoryOptions.length === 0 ? (
                <p className="text-xs text-gray-400">전문분야 목록을 불러오는 중...</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedCategories((prev) =>
                        prev.includes("전체") ? [] : ["전체"],
                      )
                    }
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                      selectedCategories.includes("전체")
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-gray-200 bg-gray-50 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50"
                    }`}
                  >
                    전체
                  </button>
                  {categoryOptions.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() =>
                        setSelectedCategories((prev) => {
                          const withoutAll = prev.filter((c) => c !== "전체");
                          return withoutAll.includes(cat)
                            ? withoutAll.filter((c) => c !== cat)
                            : [...withoutAll, cat];
                        })
                      }
                      className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                        selectedCategories.includes(cat)
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-gray-200 bg-gray-50 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <Field label="시공가능지역" required>
              <div className="flex flex-wrap gap-2">
                {WORK_ZONES.map((zone) => (
                  <button
                    key={zone}
                    type="button"
                    onClick={() => toggleZone(zone)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                      selectedZones.includes(zone)
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-gray-200 bg-gray-50 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50"
                    }`}
                  >
                    {zone}
                  </button>
                ))}
              </div>
            </Field>
          </section>

          {/* 하자보증기간 */}
          <section className="rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/5 px-5 py-6 sm:px-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">하자보증기간 <span className="text-xs font-normal text-gray-400">(선택)</span></h2>
              <p className="mt-0.5 text-xs text-gray-400">시공 완료 후 하자 보증을 제공하는 기간을 입력해주세요.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                placeholder="12"
                value={warrantyPeriod}
                onChange={(e) => setWarrantyPeriod(e.target.value.replace(/[^0-9]/g, ""))}
                className="w-20 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <span className="shrink-0 text-sm text-gray-500">개월</span>
            </div>
          </section>

          {/* 업체 소개 */}
          <section className="rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/5 px-5 py-6 sm:px-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">업체 소개</h2>

            <textarea
              placeholder="업체 소개, 시공 경력, 특기사항 등을 자유롭게 입력하세요"
              value={introduction}
              onChange={(e) => setIntroduction(e.target.value)}
              rows={4}
              className={`${inputClass} resize-none`}
            />
          </section>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-indigo-300"
          >
            {isSaving && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {isSaving ? "저장 중..." : "저장하고 시작하기"}
          </button>
        </form>
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-900">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
