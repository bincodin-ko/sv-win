// E3 S-2039: 명세 → .excalidraw (type excalidraw, version 2). 필드는 Excalidraw 파일 형식의 필수 요소만
import { exportWrite, pickSavePath } from "../lib/ipc";
import { fileName, type DiagramSpec } from "./spec";
import { INK_HEX } from "./style";

export interface ExcalidrawFile { type: "excalidraw"; version: 2; source: string; elements: Record<string, unknown>[]; appState: { viewBackgroundColor: string }; files: Record<string, never> }

const hex = (name: string) => (name === "default" ? "#1e1e1e" : (INK_HEX[name] ?? "#1e1e1e")); // 흰 배경 위 theme-fixed

export function toExcalidraw(spec: DiagramSpec): ExcalidrawFile {
  const els: Record<string, unknown>[] = [];
  let k = 0;
  const base = (type: string, x: number, y: number, w: number, h: number, stroke = "default", fill = "transparent", extra: Record<string, unknown> = {}) => {
    k++;
    const e: Record<string, unknown> = {
      id: `${type}-${k}`, type, x, y, width: w, height: h, angle: 0, strokeColor: hex(stroke), backgroundColor: fill === "transparent" ? "transparent" : hex(fill),
      fillStyle: "hachure", strokeWidth: 1, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1000 + k, version: 1,
      versionNonce: 2000 + k, isDeleted: false, boundElements: [], updated: 1, link: null, locked: false, ...extra,
    };
    els.push(e);
    return e;
  };
  const text = (t: string, x: number, y: number, w: number, h: number, size: number, align: string, container: string | null = null, stroke = "default") =>
    base("text", x, y, w, h, stroke, "transparent", { text: t, originalText: t, fontSize: size, fontFamily: 1, textAlign: align, verticalAlign: container ? "middle" : "top", containerId: container, lineHeight: 1.25, autoResize: true, baseline: size });
  const { layout: l, paints: pt } = spec;
  for (const z of l.zones) base("rectangle", z.x, z.y, z.w, z.h, pt.zones[z.group]?.stroke, "transparent", { strokeStyle: "dashed", roundness: { type: 3 } });
  text(l.title.text, l.title.x, l.title.y, l.title.w, l.title.h, 24, "center");
  const el = new Map<string, Record<string, unknown>>();
  for (const n of l.nodes) {
    const c = pt.nodes[n.id];
    const type = n.node.shape === "ellipse" ? "ellipse" : n.node.shape === "diamond" ? "diamond" : "rectangle";
    const e = base(type, n.x, n.y, n.w, n.h, c?.stroke, c?.fill, type === "rectangle" ? { roundness: { type: 3 } } : {});
    el.set(n.id, e);
    const t = text(n.node.label, n.x + 8, n.y + n.h / 2 - 12, n.w - 16, 25, 16, "center", e.id as string);
    (e.boundElements as unknown[]).push({ type: "text", id: t.id });
    if (n.node.note) text(n.node.note, n.x, n.y + n.h - 24, n.w, 18, 12, "center");
  }
  for (const e of l.edges) {
    const a = base("arrow", e.x1, e.y1, Math.abs(e.x2 - e.x1), Math.abs(e.y2 - e.y1), pt.nodes[e.from]?.stroke, "transparent", {
      points: [[0, 0], [e.x2 - e.x1, e.y2 - e.y1]], lastCommittedPoint: null, startArrowhead: null, endArrowhead: "arrow", roundness: { type: 2 },
      startBinding: { elementId: el.get(e.from)!.id, focus: 0, gap: 1 }, endBinding: { elementId: el.get(e.to)!.id, focus: 0, gap: 1 },
    });
    (el.get(e.from)!.boundElements as unknown[]).push({ type: "arrow", id: a.id });
    (el.get(e.to)!.boundElements as unknown[]).push({ type: "arrow", id: a.id });
    if (e.label) text(e.label, (e.x1 + e.x2) / 2 - 40, (e.y1 + e.y2) / 2 - 10, 80, 20, 14, "center");
  }
  return { type: "excalidraw", version: 2, source: "symvibe", elements: els, appState: { viewBackgroundColor: "#ffffff" }, files: {} }; // theme-fixed
}

/** 저장 창 → 쓰기. 취소하면 false */
export async function exportExcalidraw(spec: DiagramSpec): Promise<boolean> {
  const path = await pickSavePath(fileName(spec.title, "excalidraw"), [{ name: "Excalidraw", extensions: ["excalidraw"] }]);
  if (!path) return false;
  await exportWrite(path, new TextEncoder().encode(JSON.stringify(toExcalidraw(spec), null, 2)));
  return true;
}
