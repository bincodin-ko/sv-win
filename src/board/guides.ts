// S-025 정렬·간격 가이드 선 (순수 함수). 위치를 바꾸지 않는다(달라붙지 않음)
import type { Rect } from "./selection";
export const TOL = 4;
export interface Seg { kind: "align" | "gap"; x1: number; y1: number; x2: number; y2: number }

// 한 축 기준으로 본 사각형: a = 그 축 시작·길이, b = 가로질러 보는 축 시작·길이
interface Ax { a: number; aw: number; b: number; bw: number }
const feats = (lo: number, size: number) => [lo, lo + size / 2, lo + size];
const overlap = (lo1: number, s1: number, lo2: number, s2: number) => lo1 < lo2 + s2 && lo2 < lo1 + s1;

function axis(m: Ax, others: Ax[], tol: number, line: (pos: number, c1: number, c2: number, kind: Seg["kind"]) => Seg): Seg[] {
  const out: Seg[] = [];
  // 정렬: 가장자리·가운데 어느 것이든 이웃의 것과 tol 안이면 이웃 값 자리에 선
  const seen = new Set<string>();
  others.forEach((o, i) => {
    for (const fo of feats(o.a, o.aw))
      if (feats(m.a, m.aw).some((fm) => Math.abs(fm - fo) <= tol) && !seen.has(`${i}:${fo}`)) {
        seen.add(`${i}:${fo}`);
        out.push(line(fo, Math.min(m.b, o.b), Math.max(m.b + m.bw, o.b + o.bw), "align"));
      }
  });
  // 간격: 같은 줄(가로질러 겹침)의 이웃들과 m 을 늘어놓고, m 이 낀 빈틈이 다른 빈틈과 tol 안으로 같으면 둘 다 보인다
  const row = others.filter((o) => overlap(o.b, o.bw, m.b, m.bw));
  const sorted = [...row, m].sort((p, q) => p.a - q.a);
  const gaps: { a0: number; a1: number; c: number; hasM: boolean }[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const p = sorted[i]!, q = sorted[i + 1]!;
    const a0 = p.a + p.aw;
    if (q.a < a0) continue;
    gaps.push({ a0, a1: q.a, c: (Math.max(p.b, q.b) + Math.min(p.b + p.bw, q.b + q.bw)) / 2, hasM: p === m || q === m });
  }
  gaps.forEach((g, i) => {
    const hit = gaps.some((h, j) => i !== j && (g.hasM || h.hasM) && Math.abs(g.a1 - g.a0 - (h.a1 - h.a0)) <= tol);
    if (hit) out.push(line(g.a0, g.c, g.a1, "gap")); // gap 은 pos=시작, c1=가로질러 위치, c2=끝
  });
  return out;
}

export function computeGuides(moving: Rect, others: Rect[], tol: number = TOL): Seg[] {
  const X = (r: Rect): Ax => ({ a: r.x, aw: r.w, b: r.y, bw: r.h });
  const Y = (r: Rect): Ax => ({ a: r.y, aw: r.h, b: r.x, bw: r.w });
  const vx = (pos: number, c1: number, c2: number, kind: Seg["kind"]): Seg =>
    kind === "align" ? { kind, x1: pos, x2: pos, y1: c1, y2: c2 } : { kind, x1: pos, x2: c2, y1: c1, y2: c1 };
  const vy = (pos: number, c1: number, c2: number, kind: Seg["kind"]): Seg =>
    kind === "align" ? { kind, y1: pos, y2: pos, x1: c1, x2: c2 } : { kind, y1: pos, y2: c2, x1: c1, x2: c1 };
  return [...axis(X(moving), others.map(X), tol, vx), ...axis(Y(moving), others.map(Y), tol, vy)];
}
