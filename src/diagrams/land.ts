// E3 S-2032·S-2024: 조각(Part)을 보드에 평범한 도형으로 놓는다. 놓기 1번 = 되돌리기 1단계, 놓인 것 전부 선택
import type { BoardStore } from "../board/boards";
import { lineDefaults, shapeDefaults } from "../board/shapes/shapeChoices";
import { normalizeLine } from "../board/shapes/snap";
import { findSpot } from "../board/placement";
import { newId, type BoardNode } from "../board/store";
import { makeText } from "../notes/textNode";
import type { DiagramSpec } from "./spec";

export type Part =
  | { t: "shape"; shape: "rectangle" | "ellipse" | "diamond"; x: number; y: number; w: number; h: number; text?: string; edges?: "round" | "sharp"; stroke?: string; fill?: string; dashed?: boolean }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; head: boolean; stroke?: string }
  | { t: "text"; x: number; y: number; w: number; h: number; text: string; size?: string; align?: string };
type P = { x: number; y: number };

/** 조각들이 차지하는 상자 */
export function partsBox(parts: Part[]): { x: number; y: number; w: number; h: number } {
  const xs: number[] = [], ys: number[] = [];
  for (const p of parts) {
    if (p.t === "line") { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2); }
    else { xs.push(p.x, p.x + p.w); ys.push(p.y, p.y + p.h); }
  }
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** origin = 조각 좌표 (0,0)이 놓일 월드 좌표. 새 노드 id 들을 돌려준다 */
export function placeParts(store: BoardStore, parts: Part[], origin: P, diagramId?: string): string[] {
  const s = store.getState();
  s.commit();
  let z = Object.values(s.nodes).reduce((m, n) => Math.max(m, n.z), 0);
  const made: string[] = [];
  const tag = diagramId ? { diagramId } : {};
  for (const p of parts) {
    const kind = p.t;
    const id = newId(kind, store.getState().nodes);
    let n: BoardNode;
    if (p.t === "shape") {
      n = { ...shapeDefaults(), ...tag, id, kind, z: ++z, shape: p.shape, x: origin.x + p.x, y: origin.y + p.y, w: p.w, h: p.h, text: p.text ?? "", edges: p.edges ?? "round",
        ...(p.stroke ? { stroke: p.stroke } : {}), ...(p.fill ? { fill: p.fill } : {}), ...(p.dashed ? { strokeStyle: "dashed" } : {}) };
    } else if (p.t === "line") {
      const l = normalizeLine({ x: origin.x + p.x1, y: origin.y + p.y1 }, { x: origin.x + p.x2, y: origin.y + p.y2 }, null);
      n = { ...lineDefaults(), ...tag, id, kind, z: ++z, head: p.head, ...(p.stroke ? { stroke: p.stroke } : {}), x: l.x, y: l.y, w: l.w, h: l.h, points: l.points, bend: null };
    } else {
      n = { ...makeText(p.text), ...tag, id, kind, z: ++z, x: origin.x + p.x, y: origin.y + p.y, w: p.w, h: p.h, ...(p.size ? { size: p.size } : {}), ...(p.align ? { align: p.align } : {}) };
    }
    store.getState().addNode(n);
    made.push(id);
  }
  store.getState().select(made);
  return made;
}

/** 명세 → 조각. 영역(맨 뒤) → 제목 → 노드(+노트) → 화살표(+라벨) */
export function specParts(spec: DiagramSpec): Part[] {
  const { layout: l, paints: pt } = spec;
  const parts: Part[] = [];
  for (const z of l.zones) parts.push({ t: "shape", shape: "rectangle", x: z.x, y: z.y, w: z.w, h: z.h, edges: "round", stroke: pt.zones[z.group]?.stroke, dashed: true });
  parts.push({ t: "text", x: l.title.x, y: l.title.y, w: l.title.w, h: l.title.h, text: l.title.text, size: "L", align: "center" });
  for (const n of l.nodes) {
    const c = pt.nodes[n.id];
    parts.push({
      t: "shape", shape: n.node.shape === "ellipse" ? "ellipse" : n.node.shape === "diamond" ? "diamond" : "rectangle", x: n.x, y: n.y, w: n.w, h: n.h,
      text: n.node.label, edges: n.node.shape === "box" ? "sharp" : "round", stroke: c?.stroke, fill: c?.fill,
    });
    if (n.node.note) parts.push({ t: "text", x: n.x, y: n.y + n.h - 26, w: n.w, h: 20, text: n.node.note, size: "S", align: "center" });
  }
  for (const e of l.edges) {
    parts.push({ t: "line", x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, head: true, stroke: pt.nodes[e.from]?.stroke });
    if (e.label) parts.push({ t: "text", x: (e.x1 + e.x2) / 2 - 50, y: (e.y1 + e.y2) / 2 - 10, w: 100, h: 20, text: e.label, size: "S", align: "center" });
  }
  return parts;
}

/** base = 블록 왼쪽 위 후보(없으면 보이는 화면 가운데). 겹치지 않는 자리로 밀어 놓는다(S-2032) */
export function landDiagram(store: BoardStore, spec: DiagramSpec, diagramId: string, base?: P): string[] {
  const parts = specParts(spec);
  const box = partsBox(parts);
  const s = store.getState(), v = s.viewport;
  const at = base ?? { x: -v.x / v.zoom - box.w / 2, y: -v.y / v.zoom - box.h / 2 };
  const spot = findSpot(at, { w: box.w, h: box.h }, Object.values(s.nodes));
  return placeParts(store, parts, { x: spot.x - box.x, y: spot.y - box.y }, diagramId);
}
