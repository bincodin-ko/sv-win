// E3 S-2024: 스타터 4개 (AI 없음, diagramId 없음). 개수는 명세, 크기·간격은 추측
import type { BoardStore } from "../board/boards";
import { tm } from "../i18n";
import { partsBox, placeParts, type Part } from "./land";

export type StarterId = "flow" | "steps" | "decision" | "mindmap";
const box = (x: number, y: number, text: string, edges: "round" | "sharp" = "sharp", w = 140, h = 56): Part => ({ t: "shape", shape: "rectangle", x, y, w, h, text, edges });
const arrow = (x1: number, y1: number, x2: number, y2: number): Part => ({ t: "line", x1, y1, x2, y2, head: true });
const label = (x: number, y: number, text: string): Part => ({ t: "text", x: x - 20, y: y - 10, w: 40, h: 20, text, size: "S", align: "center" });

export const STARTERS: { id: StarterId; label: string; parts: () => Part[] }[] = [
  { id: "flow", label: tm("Flow"), parts: () => [box(0, 0, "Start"), box(0, 120, "Step"), box(0, 240, "End"), arrow(70, 56, 70, 120), arrow(70, 176, 70, 240)] },
  {
    id: "steps", label: tm("Steps"),
    parts: () => [0, 1, 2, 3].flatMap((i): Part[] => [box(i * 200, 0, `Step ${i + 1}`, "round", 140, 44), ...(i < 3 ? [arrow(i * 200 + 140, 22, i * 200 + 200, 22)] : [])]),
  },
  {
    id: "decision", label: tm("Decision branch"),
    parts: () => [
      { t: "shape", shape: "diamond", x: 90, y: 0, w: 170, h: 96, text: "Question?" },
      box(0, 200, "Yes path"), box(210, 200, "No path"),
      arrow(150, 74, 70, 200), arrow(200, 74, 280, 200),
      label(95, 150, "Yes"), label(250, 150, "No"),
    ],
  },
  {
    id: "mindmap", label: tm("Mind map"),
    parts: () => [
      { t: "shape", shape: "ellipse", x: 200, y: 150, w: 160, h: 64, text: "Idea" },
      box(210, 0, "Topic 1"), box(210, 330, "Topic 2"), box(0, 154, "Topic 3"), box(420, 154, "Topic 4"),
      arrow(280, 150, 280, 56), arrow(280, 214, 280, 330), arrow(200, 182, 140, 182), arrow(360, 182, 420, 182),
    ],
  },
];

/** at = 가운데가 될 월드 좌표(없으면 보이는 화면 가운데). 눌린 자리가 가운데라 빈자리 찾기는 하지 않는다 */
export function placeStarter(store: BoardStore, id: StarterId, at?: { x: number; y: number }): string[] {
  const parts = STARTERS.find((s) => s.id === id)!.parts();
  const b = partsBox(parts);
  const v = store.getState().viewport;
  const c = at ?? { x: -v.x / v.zoom, y: -v.y / v.zoom };
  return placeParts(store, parts, { x: c.x - b.w / 2 - b.x, y: c.y - b.h / 2 - b.y });
}
