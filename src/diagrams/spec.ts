// E3 S-2035: 놓은 그림의 명세(내보내기가 이것을 읽는다). 상대 좌표
import { layoutDiagram, type Layout } from "./layout";
import type { Diagram } from "./parse";
import type { DiagramStyle } from "./prompt";
import { paints, type Paint } from "./style";

export interface DiagramSpec { v: 1; title: string; style: DiagramStyle; layout: Layout; paints: { nodes: Record<string, Paint>; zones: Record<string, Paint> } }

export function buildSpec(d: Diagram, style: DiagramStyle): DiagramSpec {
  const layout = layoutDiagram(d);
  return { v: 1, title: d.title, style, layout, paints: paints(layout, style) };
}
export function parseSpec(json: string | null): DiagramSpec | null {
  if (!json) return null;
  try {
    const s = JSON.parse(json) as DiagramSpec;
    return s?.v === 1 && Array.isArray(s.layout?.nodes) ? s : null;
  } catch {
    return null;
  }
}
/** 저장 대화상자 기본 이름: 파일 이름에 못 쓰는 글자를 뺀다 */
export function fileName(title: string, ext: string): string {
  const t = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim();
  return `${t || "diagram"}.${ext}`;
}
