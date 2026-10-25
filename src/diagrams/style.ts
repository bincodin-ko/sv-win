// E3 S-2033: Ink / Colorful 색 정하기 + 패널 스타일 상태(메모리만, 저장 안 함 S-2022)
import { create } from "zustand";
import type { Layout } from "./layout";
import type { DiagramStyle } from "./prompt";

export interface Paint { stroke: string; fill: string }
export const COLORFUL = ["red", "orange", "yellow", "green", "blue", "violet"]; // 팔레트 순서는 추측
/** 색 이름 → 내보내기용 값(tokens.css 어두운 테마 --ink-*). default = 어두운 배경 위 글자색 */
export const INK_HEX: Record<string, string> = {
  default: "#ececf0", red: "#ef4444", orange: "#f97316", yellow: "#eab308", green: "#22c55e", blue: "#3b82f6", violet: "#a78bfa", white: "#f5f5f5", black: "#111111", // theme-fixed
};
const INK: Paint = { stroke: "default", fill: "transparent" };

/** 노드·영역마다 칠할 색. Colorful = 그룹(없으면 층)마다 처음 나온 순서로 색 이름을 돌려 쓴다 */
export function paints(l: Layout, style: DiagramStyle): { nodes: Record<string, Paint>; zones: Record<string, Paint> } {
  const nodes: Record<string, Paint> = {}, zones: Record<string, Paint> = {};
  const colors = new Map<string, string>();
  const colorOf = (key: string) => colors.get(key) ?? (colors.set(key, COLORFUL[colors.size % COLORFUL.length]!), colors.get(key)!);
  for (const n of l.nodes) {
    if (style === "ink") nodes[n.id] = INK;
    else { const c = colorOf(n.node.group ? `g:${n.node.group}` : `l:${n.layer}`); nodes[n.id] = { stroke: c, fill: c }; }
  }
  for (const z of l.zones) zones[z.group] = style === "ink" ? INK : { stroke: colorOf(`g:${z.group}`), fill: "transparent" };
  return { nodes, zones };
}
export const useDiagramStyle = create<{ style: DiagramStyle; set: (s: DiagramStyle) => void }>((set) => ({ style: "ink", set: (style) => set({ style }) }));
