// S-827: 손그림 흔들림 경로 (순수). 같은 seed = 같은 모양.
export type P = { x: number; y: number };
export type ShapeName = "rectangle" | "ellipse" | "diamond";
export const ROUND_R = 12; // S-829: Round 모서리 반지름(추측)
const f = (n: number) => +n.toFixed(2);
/** 굵기 1|2|3 = 2/4/6 px (S-822, 추측) */
export const strokePx = (strokeWidth: number): number => [2, 4, 6][strokeWidth - 1] ?? 2;
/** 획 진폭: Architect 0, Artist 굵기×0.6, Cartoonist 굵기×1.5 (S-827) */
export const amplitude = (roughness: number, strokeWidth: number): number => (roughness === 1 ? 0.6 : roughness === 2 ? 1.5 : 0) * strokePx(strokeWidth);

function rng(seed: number): () => number { // mulberry32
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 점마다 x·y 를 ±amp 안에서 흔든다. 같은 seed 는 같은 결과 */
export function wobble(pts: P[], amp: number, seed: number): P[] {
  if (!amp) return pts;
  const r = rng(seed);
  return pts.map((p) => ({ x: p.x + (r() * 2 - 1) * amp, y: p.y + (r() * 2 - 1) * amp }));
}
const STEP = 40;
const seg = (a: P, b: P): P[] => { // a 포함, b 제외
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / STEP));
  return Array.from({ length: n }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
};
const poly = (v: P[]): P[] => v.flatMap((p, i) => seg(p, v[(i + 1) % v.length]!));
/** 윤곽을 따라 고른 점들(흔들기 전) */
export function outlinePoints(shape: ShapeName, w: number, h: number, edges: "sharp" | "round"): P[] {
  if (shape === "diamond") return poly([{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }]);
  if (shape === "ellipse") return Array.from({ length: 36 }, (_, i) => ({ x: w / 2 + (w / 2) * Math.cos((i * Math.PI) / 18), y: h / 2 + (h / 2) * Math.sin((i * Math.PI) / 18) }));
  const r = edges === "round" ? Math.min(ROUND_R, w / 2, h / 2) : 0;
  if (!r) return poly([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]);
  const arc = (cx: number, cy: number, a0: number) => [0, 1, 2, 3].map((i) => ({ x: cx + r * Math.cos(a0 + (i * Math.PI) / 6), y: cy + r * Math.sin(a0 + (i * Math.PI) / 6) }));
  const c = [arc(w - r, r, -Math.PI / 2), arc(w - r, h - r, 0), arc(r, h - r, Math.PI / 2), arc(r, r, Math.PI)];
  return c.flatMap((a, i) => [...a, ...seg(a[3]!, c[(i + 1) % 4]![0]!).slice(1)]);
}
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const pt = (p: P) => `${f(p.x)} ${f(p.y)}`;
/** 닫힌 점들을 중간점끼리 이어 그린 부드러운 곡선 */
const smoothClosed = (v: P[]): string => `M${pt(mid(v[v.length - 1]!, v[0]!))}${v.map((p, i) => `Q${pt(p)} ${pt(mid(p, v[(i + 1) % v.length]!))}`).join("")}Z`;

export type ShapeOpts = { shape: ShapeName; w: number; h: number; edges: "sharp" | "round"; roughness: number; strokeWidth: number; seed: number };
export function shapePath({ shape, w, h, edges, roughness, strokeWidth, seed }: ShapeOpts): string {
  if (roughness <= 0) {
    if (shape === "ellipse") return `M0 ${f(h / 2)}A${f(w / 2)} ${f(h / 2)} 0 1 0 ${f(w)} ${f(h / 2)}A${f(w / 2)} ${f(h / 2)} 0 1 0 0 ${f(h / 2)}Z`;
    if (shape === "diamond") return `M${f(w / 2)} 0L${f(w)} ${f(h / 2)}L${f(w / 2)} ${f(h)}L0 ${f(h / 2)}Z`;
    const r = edges === "round" ? Math.min(ROUND_R, w / 2, h / 2) : 0;
    if (!r) return `M0 0H${f(w)}V${f(h)}H0Z`;
    const a = `A${r} ${r} 0 0 1 `;
    return `M${r} 0H${f(w - r)}${a}${f(w)} ${r}V${f(h - r)}${a}${f(w - r)} ${f(h)}H${r}${a}0 ${f(h - r)}V${r}${a}${r} 0Z`;
  }
  return smoothClosed(wobble(outlinePoints(shape, w, h, edges), amplitude(roughness, strokeWidth), seed));
}

export type LineOpts = { p0: P; p1: P; bend: P | null; roughness: number; strokeWidth: number; seed: number };
export function linePath({ p0, p1, bend, roughness, strokeWidth, seed }: LineOpts): string {
  if (roughness <= 0) return bend ? `M${pt(p0)}Q${pt(bend)} ${pt(p1)}` : `M${pt(p0)}L${pt(p1)}`;
  const n = Math.max(3, Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y) / STEP));
  const at = (t: number): P => bend
    ? { x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * bend.x + t * t * p1.x, y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * bend.y + t * t * p1.y }
    : { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
  const v = wobble(Array.from({ length: n + 1 }, (_, i) => at(i / n)), amplitude(roughness, strokeWidth), seed);
  return `M${pt(v[0]!)}${v.slice(1, -1).map((p, i) => `Q${pt(p)} ${pt(mid(p, v[i + 2]!))}`).join("")}L${pt(v[n]!)}`;
}
