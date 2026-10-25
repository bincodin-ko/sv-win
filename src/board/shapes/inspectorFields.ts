// S-825: 인스펙터에 보일 절·필드 계산 (순수) + 값 일괄 바꾸기
import type { BoardStore } from "../boards";
import type { BoardNode } from "../store";
export type Section = "lines" | "fill" | "shape" | "text" | "order";
const ORDER: Section[] = ["lines", "fill", "shape", "text", "order"];
const byKind = new Map<string, Section[]>([
  ["shape", ORDER],
  ["line", ["lines", "shape", "order"]], // 선·화살표: Fill·Text 절 없음, Shape 절에는 Opacity 만
]);
/** 종류가 인스펙터를 가지려면 등록한다 (C10 이 text 종류를 더한다) */
export const registerInspectorKind = (kind: string, sections: Section[]): void => void byKind.set(kind, sections);
/** 선택한 노드 모두가 가진 절. 하나라도 인스펙터가 없는 종류면 [] */
export function sectionsFor(nodes: BoardNode[]): Section[] {
  if (!nodes.length) return [];
  const lists = nodes.map((n) => byKind.get(n.kind));
  if (lists.some((l) => !l)) return [];
  return ORDER.filter((s) => lists.every((l) => l!.includes(s)));
}
/** 보일 필드 이름들 */
export function fieldsFor(nodes: BoardNode[]): string[] {
  const secs = sectionsFor(nodes), out: string[] = [];
  if (secs.includes("lines")) out.push("stroke", ...(nodes.every((n) => n.kind === "text") ? [] : ["strokeWidth", "strokeStyle", "roughness"])); // 텍스트 상자의 Lines 는 글자색뿐(S-846)
  if (secs.includes("fill")) out.push("fill");
  if (secs.includes("fill") && nodes.some((n) => n.fill && n.fill !== "transparent")) out.push("fillStyle");
  if (secs.includes("shape")) out.push("opacity");
  if (secs.includes("shape") && nodes.every((n) => n.kind === "shape")) out.push("edges");
  if (secs.includes("text")) out.push("font", "size", "align");
  return out;
}
/** 모두 같은 값이면 그 값, 아니면 undefined */
export const commonValue = (nodes: BoardNode[], key: string): unknown => (nodes.length && nodes.every((n) => n[key] === nodes[0]![key]) ? nodes[0]![key] : undefined);
/** 값 하나를 바꾸는 것 = 되돌리기 1단계 */
export function applyFields(store: BoardStore, ids: string[], patch: Record<string, unknown>): void {
  const s = store.getState();
  const live = ids.filter((id) => s.nodes[id]);
  if (!live.length) return;
  s.commit();
  for (const id of live) s.updateNode(id, patch);
}
