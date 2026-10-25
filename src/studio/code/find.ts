// 5묶음 E4 S-1878: 찾기 순수 함수
/** 대소문자 무시, 겹치지 않는 일치의 시작 위치들 */
export function findMatches(text: string, q: string): number[] {
  const out: number[] = [];
  if (!q) return out;
  const t = text.toLowerCase(), k = q.toLowerCase();
  for (let i = t.indexOf(k); i >= 0; i = t.indexOf(k, i + k.length)) out.push(i);
  return out;
}
/** 현재 번호에서 한 칸(dir=1 다음, -1 이전), 끝에서 감긴다. 일치가 없으면 -1 */
export const step = (cur: number, count: number, dir: 1 | -1): number =>
  count <= 0 ? -1 : cur < 0 ? (dir === 1 ? 0 : count - 1) : (cur + dir + count) % count;
/** 커서 위치 이후 첫 일치의 번호(없으면 0, 일치가 없으면 -1) */
export const firstFrom = (matches: number[], caret: number): number => {
  if (!matches.length) return -1;
  const i = matches.findIndex((m) => m >= caret);
  return i < 0 ? 0 : i;
};
