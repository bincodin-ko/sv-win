// S-061·S-062 콘솔 이름 (순수 함수)
export const POOL = ["Otto", "Dax", "Maya", "Rafa", "Nova", "Iris", "Kai", "Zoe", "Leo", "Mila", "Ren", "Juno", "Ada", "Bex", "Cy", "Pip"];
export const MAX_NAME = 23;

/** 보드에서 안 쓰인 첫 이름 */
export function nextName(used: string[]): string {
  const u = new Set(used);
  for (let n = 1; ; n++) for (const p of POOL) if (!u.has(n === 1 ? p : `${p} ${n}`)) return n === 1 ? p : `${p} ${n}`;
}

/** 편집 결과: 빈 이름이면 null(취소), 아니면 23자로 자르고 중복 시 " 2", " 3"… 을 붙인다. used 에는 자기 자신을 뺀 이름들을 준다 */
export function editName(input: string, used: string[]): string | null {
  const base = input.trim().slice(0, MAX_NAME).trim();
  if (!base) return null;
  const u = new Set(used);
  let name = base;
  for (let n = 2; u.has(name); n++) name = `${base} ${n}`;
  return name;
}
