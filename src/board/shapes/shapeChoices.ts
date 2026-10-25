// S-820~S-822: Shapes flyout 항목과 새 노드 기본값
import { create } from "zustand";
import { tm } from "../../i18n";
export type ShapeChoiceId = "rectangle" | "ellipse" | "diamond" | "line" | "arrow" | "sticky";
export type ShapeChoice = { id: ShapeChoiceId; label: string; kind: "shape" | "line" | "sticky" };
export const SHAPE_CHOICES: ShapeChoice[] = [
  { id: "rectangle", label: tm("Rectangle"), kind: "shape" },
  { id: "ellipse", label: tm("Ellipse"), kind: "shape" },
  { id: "diamond", label: tm("Diamond"), kind: "shape" },
  { id: "line", label: tm("Line"), kind: "line" },
  { id: "arrow", label: tm("Arrow"), kind: "line" },
  { id: "sticky", label: tm("Sticky"), kind: "sticky" }, // C10(S-840)
];
export const SHAPE_SIZE = { w: 160, h: 100 };
export const LINE_LEN = 160;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
/** 선 계열 공통 기본값 */
export const styleDefaults = (): Record<string, unknown> => ({ stroke: "default", strokeWidth: 1, strokeStyle: "solid", roughness: 1, opacity: 100, seed: newSeed() });
export const shapeDefaults = (): Record<string, unknown> => ({ ...styleDefaults(), fill: "transparent", fillStyle: "hachure", edges: "round", text: "", font: "clean", size: "M", align: "center" });
export const lineDefaults = (): Record<string, unknown> => ({ ...styleDefaults(), bend: null });
/** 무장된 도형(flyout 에서 고른 것) */
export const useArmedShape = create<{ id: ShapeChoiceId | null; set: (id: ShapeChoiceId | null) => void }>((set) => ({ id: null, set: (id) => set({ id }) }));
