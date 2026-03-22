/**
 * work_tree / work_details.subs / category 배열에 문자열 대신 { name: string } 형태로
 * 저장된 레거시·외부 데이터가 있을 때 UI에서 안전하게 문자열로 씁니다.
 */
export function normalizeWorkLabel(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object" && v !== null && "name" in v) {
    const n = (v as { name?: unknown }).name;
    if (typeof n === "string") return n.trim();
    if (n != null) return String(n).trim();
  }
  return String(v).trim();
}

export function normalizeWorkTreeGroup<T extends { cat?: unknown; subs?: unknown }>(raw: T): { cat: string; subs: string[] } {
  const cat = normalizeWorkLabel(raw.cat);
  const subs = Array.isArray(raw.subs) ? raw.subs.map(normalizeWorkLabel).filter(Boolean) : [];
  return { cat, subs };
}
