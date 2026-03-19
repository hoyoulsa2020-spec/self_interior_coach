// 1평 = 3.3058㎡
const PER_PYEONG = 3.3058;

export function m2ToPyeong(m2: number): number {
  return m2 / PER_PYEONG;
}

export function pyeongToM2(pyeong: number): number {
  return pyeong * PER_PYEONG;
}

/** DB(㎡) → 표시용 문자열. 기본 평 표시, 괄호 안에 ㎡ */
export function formatArea(m2: number | null | undefined): string {
  if (m2 == null) return "—";
  const pyeong = m2ToPyeong(m2);
  return `${pyeong.toFixed(1)}평 (${m2.toFixed(1)}㎡)`;
}

/** 평 전용 표시 */
export function formatPyeong(m2: number | null | undefined): string {
  if (m2 == null) return "—";
  return `${m2ToPyeong(m2).toFixed(1)}평`;
}

/** ㎡ 전용 표시 */
export function formatM2(m2: number | null | undefined): string {
  if (m2 == null) return "—";
  return `${m2.toFixed(1)}㎡`;
}
