// E3 S-2031: 위에서 아래 층 배치 (순수·결정적). 크기·간격 값은 명세 추측값
import type { Diagram, DiagramNode } from "./parse";

export interface LNode { id: string; node: DiagramNode; layer: number; x: number; y: number; w: number; h: number }
export interface LEdge { from: string; to: string; label?: string; x1: number; y1: number; x2: number; y2: number }
export interface LZone { group: string; x: number; y: number; w: number; h: number }
export interface Layout {
  nodes: LNode[];
  edges: LEdge[];
  zones: LZone[];
  title: { text: string; x: number; y: number; w: number; h: number };
  width: number;
  height: number;
}

const LAYER_GAP = 64;
const SIDE_GAP = 48;
const ZONE_PAD = 24;
const TITLE_H = 40;
const TITLE_GAP = 32;
const r2 = (n: number) => Math.round(n * 100) / 100;

function size(n: DiagramNode): { w: number; h: number } {
  const note = n.note ? 20 : 0;
  if (n.shape === "pill") return { w: 160, h: 44 + note };
  if (n.shape === "ellipse") return { w: 160, h: 64 + note };
  if (n.shape === "diamond") return { w: 170, h: 96 + note };
  return { w: Math.min(220, Math.max(140, n.label.length * 9 + 40)), h: 56 + note };
}

/** 가장자리 점: 중심에서 p 쪽으로 도형 윤곽까지 */
function clip(n: { x: number; y: number; w: number; h: number; node: DiagramNode }, p: { x: number; y: number }) {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2, dx = p.x - cx, dy = p.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const a = n.w / 2, b = n.h / 2;
  const t =
    n.node.shape === "ellipse" ? 1 / Math.hypot(dx / a, dy / b)
    : n.node.shape === "diamond" ? 1 / (Math.abs(dx) / a + Math.abs(dy) / b)
    : Math.min(dx ? a / Math.abs(dx) : Infinity, dy ? b / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
}

export function layoutDiagram(d: Diagram): Layout {
  const ids = d.nodes.map((n) => n.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const edges = d.edges.filter((e) => e.from !== e.to && idx.has(e.from) && idx.has(e.to));
  // 고리 끊기: DFS 에서 스택에 있는 노드로 돌아가는 간선은 층 정하기에서 뺀다
  const out = ids.map(() => [] as number[]);
  edges.forEach((e, k) => out[idx.get(e.from)!]!.push(k));
  const state = ids.map(() => 0); // 0 안 감, 1 스택, 2 끝
  const back = new Set<number>();
  const order: number[] = [];
  const dfs = (u: number) => {
    state[u] = 1;
    for (const k of out[u]!) {
      const v = idx.get(edges[k]!.to)!;
      if (state[v] === 1) back.add(k);
      else if (state[v] === 0) dfs(v);
    }
    state[u] = 2;
    order.push(u);
  };
  ids.forEach((_, i) => state[i] === 0 && dfs(i));
  // 가장 긴 경로로 층: 위상 순서(끝난 순서의 역순)로 늘려 간다
  const layer = ids.map(() => 0);
  for (const u of order.reverse()) for (const k of out[u]!) if (!back.has(k)) layer[idx.get(edges[k]!.to)!] = Math.max(layer[idx.get(edges[k]!.to)!]!, layer[u]! + 1);
  const rows: number[][] = [];
  ids.forEach((_, i) => (rows[layer[i]!] ??= []).push(i));
  // 층 안 순서: 이웃 평균 위치로 2번(아래로 한 번, 위로 한 번)
  const pos = ids.map(() => 0);
  const place = () => rows.forEach((r) => r.forEach((u, i) => (pos[u] = i)));
  place();
  const sweep = (nbr: (u: number) => number[], from: number, to: number, step: number) => {
    for (let l = from; l !== to; l += step) {
      const r = rows[l]!;
      const key = (u: number) => { const ns = nbr(u); return ns.length ? ns.reduce((s, v) => s + pos[v]!, 0) / ns.length : pos[u]!; };
      rows[l] = r.map((u, i) => ({ u, i, k: key(u) })).sort((a, b) => a.k - b.k || a.i - b.i).map((o) => o.u);
      place();
    }
  };
  const live = edges.filter((_, k) => !back.has(k));
  const up = (u: number) => live.filter((e) => idx.get(e.to) === u).map((e) => idx.get(e.from)!);
  const down = (u: number) => live.filter((e) => idx.get(e.from) === u).map((e) => idx.get(e.to)!);
  sweep(up, 1, rows.length, 1);
  sweep(down, rows.length - 2, -1, -1);
  // 좌표 (제목 아래부터, 층은 가운데 정렬)
  const nodes: LNode[] = new Array(ids.length);
  let y = TITLE_H + TITLE_GAP;
  for (const r of rows) {
    const sz = r.map((u) => size(d.nodes[u]!));
    const total = sz.reduce((s, z) => s + z.w, 0) + SIDE_GAP * (r.length - 1);
    const lh = Math.max(...sz.map((z) => z.h));
    let x = -total / 2;
    r.forEach((u, i) => {
      nodes[u] = { id: ids[u]!, node: d.nodes[u]!, layer: layer[u]!, x, y: y + (lh - sz[i]!.h) / 2, w: sz[i]!.w, h: sz[i]!.h };
      x += sz[i]!.w + SIDE_GAP;
    });
    y += lh + LAYER_GAP;
  }
  // 영역: 그룹 2개 이상이고 둘러싼 상자(+24)가 서로 안 겹칠 때만
  const byGroup = new Map<string, LNode[]>();
  for (const n of nodes) if (n.node.group) byGroup.set(n.node.group, [...(byGroup.get(n.node.group) ?? []), n]);
  let zones: LZone[] = [...byGroup].map(([group, ns]) => {
    const x0 = Math.min(...ns.map((n) => n.x)) - ZONE_PAD, y0 = Math.min(...ns.map((n) => n.y)) - ZONE_PAD;
    return { group, x: x0, y: y0, w: Math.max(...ns.map((n) => n.x + n.w)) + ZONE_PAD - x0, h: Math.max(...ns.map((n) => n.y + n.h)) + ZONE_PAD - y0 };
  });
  const hit = (a: LZone, b: LZone) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  if (zones.length < 2 || zones.some((a, i) => zones.slice(i + 1).some((b) => hit(a, b)))) zones = [];
  // 제목은 맨 위 가운데. (0,0) 기준으로 옮긴다
  const text = d.title;
  const tw = Math.max(160, text.length * 14);
  let minX = Math.min(...nodes.map((n) => n.x), ...zones.map((z) => z.x));
  let maxX = Math.max(...nodes.map((n) => n.x + n.w), ...zones.map((z) => z.x + z.w));
  if (tw > maxX - minX) { const c = (minX + maxX) / 2; minX = c - tw / 2; maxX = c + tw / 2; }
  const maxY = Math.max(...nodes.map((n) => n.y + n.h), ...zones.map((z) => z.y + z.h));
  const sx = -minX;
  return {
    nodes: nodes.map((n) => ({ ...n, x: r2(n.x + sx), y: r2(n.y) })),
    edges: edges.map((e) => {
      const a = nodes[idx.get(e.from)!]!, b = nodes[idx.get(e.to)!]!;
      const p = clip(a, { x: b.x + b.w / 2, y: b.y + b.h / 2 }), q = clip(b, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
      return { from: e.from, to: e.to, ...(e.label ? { label: e.label } : {}), x1: r2(p.x + sx), y1: r2(p.y), x2: r2(q.x + sx), y2: r2(q.y) };
    }),
    zones: zones.map((z) => ({ ...z, x: r2(z.x + sx), y: r2(z.y) })),
    title: { text, x: r2((maxX - minX) / 2 - tw / 2), y: 0, w: tw, h: TITLE_H },
    width: r2(maxX - minX),
    height: r2(maxY),
  };
}
