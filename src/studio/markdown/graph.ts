// 5묶음 E5 S-1933·S-1934: 그래프 자료와 배치(순수·결정적).
import { extractLinks, resolveRel } from "./links";

export type GNode = { id: string; name: string; degree: number };
export type GEdge = { a: string; b: string };
export type Graph = { nodes: GNode[]; edges: GEdge[] };
export type Pos = Record<string, { x: number; y: number }>;

const fwd = (p: string) => p.replace(/\\/g, "/");
const stemOf = (p: string) => fwd(p).split("/").pop()!.replace(/\.[^.]*$/, "");

export function buildGraph(files: { path: string; text: string }[]): Graph {
  const byLower = new Map<string, string>(); // 경로(소문자) → 경로
  const byStem = new Map<string, string>(); // 이름(소문자) → 경로가 가장 짧은 글
  for (const { path } of files) {
    byLower.set(fwd(path).toLowerCase(), path);
    const k = stemOf(path).toLowerCase(), cur = byStem.get(k);
    if (!cur || path.length < cur.length || (path.length === cur.length && path < cur)) byStem.set(k, path);
  }
  const seen = new Set<string>();
  const edges: GEdge[] = [];
  const deg = new Map<string, number>();
  for (const f of files) {
    for (const l of extractLinks(f.text)) {
      const to = l.kind === "wiki" ? byStem.get(fwd(l.target).split("/").pop()!.replace(/\.(md|markdown|mdx)$/i, "").toLowerCase()) : byLower.get(resolveRel(f.path, l.target)?.path.toLowerCase() ?? "");
      if (!to || to === f.path) continue;
      const [a, b] = f.path < to ? [f.path, to] : [to, f.path];
      const key = `${a}\n${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a, b });
      deg.set(a, (deg.get(a) ?? 0) + 1);
      deg.set(b, (deg.get(b) ?? 0) + 1);
    }
  }
  return { nodes: files.map((f) => ({ id: f.path, name: stemOf(f.path), degree: deg.get(f.path) ?? 0 })), edges };
}

/** 점 600개 넘으면 120번, 아니면 300번 */
export const layoutIterations = (n: number): number => (n > 600 ? 120 : 300);

const MIN_SEP = 20; // 점 최대 지름(9px*2)보다 크게
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
};

/** 조각으로 나눠 돌릴 수 있는 힘 기반 배치(밀어냄·스프링·중심 끌림). step(k) 가 true 면 끝 */
export function createLayout(g: Graph, spacing = 1, seed = 0) {
  const n = g.nodes.length, total = layoutIterations(n);
  const k = 60 * spacing; // 스프링 길이·밀어냄 기준
  const R = k * (1 + Math.sqrt(n));
  type Pt = { x: number; y: number; dx: number; dy: number };
  const P: Pt[] = g.nodes.map((nd, i) => {
    const a = (((hash(nd.id) + Math.imul(seed, 0x9e3779b1)) >>> 0) / 4294967296) * Math.PI * 2;
    return { x: Math.cos(a) * R + i * 1e-3, y: Math.sin(a) * R + i * 1e-3, dx: 0, dy: 0 }; // i 로 조금 비껴 겹친 시작도 갈라지게
  });
  const idx = new Map(g.nodes.map((nd, i) => [nd.id, i]));
  const E: [Pt, Pt][] = [];
  for (const e of g.edges) { const a = idx.get(e.a), b = idx.get(e.b); if (a !== undefined && b !== undefined) E.push([P[a]!, P[b]!]); }
  let it = 0;
  const iterate = () => {
    const t = k * 0.5 * (1 - it / total) + 0.5; // 식는 온도
    for (const p of P) { p.dx = 0; p.dy = 0; }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = P[i]!, b = P[j]!;
      let ex = a.x - b.x, ey = a.y - b.y, d = Math.hypot(ex, ey);
      if (d < 0.01) { ex = 0.01; ey = 0; d = 0.01; }
      const f = (k * k) / (d * d); // 밀어냄 k²/d 를 단위벡터로
      a.dx += ex * f; a.dy += ey * f; b.dx -= ex * f; b.dy -= ey * f;
    }
    for (const [a, b] of E) {
      const ex = a.x - b.x, ey = a.y - b.y, f = (Math.hypot(ex, ey) || 0.01) / k; // 스프링 d²/k 를 단위벡터로
      a.dx -= ex * f; a.dy -= ey * f; b.dx += ex * f; b.dy += ey * f;
    }
    for (const p of P) {
      p.dx -= p.x * 0.02; p.dy -= p.y * 0.02; // 중심 끌림
      const d = Math.hypot(p.dx, p.dy) || 1, m = Math.min(d, t);
      p.x += (p.dx / d) * m; p.y += (p.dy / d) * m;
    }
    it++;
  };
  const separate = () => { // 마지막에 겹친 점만 밀어 낸다(결정적)
    for (let pass = 0; pass < 60; pass++) {
      let moved = false;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = P[i]!, b = P[j]!;
        let ex = b.x - a.x, ey = b.y - a.y, d = Math.hypot(ex, ey);
        if (d >= MIN_SEP) continue;
        if (d < 1e-6) { ex = 1; ey = 0; d = 1; }
        const push = (MIN_SEP - d) / 2 + 0.01;
        a.x -= (ex / d) * push; a.y -= (ey / d) * push; b.x += (ex / d) * push; b.y += (ey / d) * push;
        moved = true;
      }
      if (!moved) break;
    }
  };
  return {
    /** count 번 더 돌린다. true = 끝(겹침 정리까지 마침) */
    step(count: number): boolean {
      if (it > total) return true;
      for (let c = 0; c < count && it < total; c++) iterate();
      if (it < total) return false;
      separate();
      it = total + 1; // 정리는 한 번만
      return true;
    },
    pos(): Pos { return Object.fromEntries(g.nodes.map((nd, i) => [nd.id, { x: P[i]!.x, y: P[i]!.y }])); },
  };
}

export function layoutGraph(g: Graph, spacing = 1, seed = 0): Pos {
  const l = createLayout(g, spacing, seed);
  l.step(Infinity);
  return l.pos();
}
