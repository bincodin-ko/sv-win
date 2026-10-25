// 5묶음 E1 S-1800: 스튜디오 registry (3묶음 kinds registry 와 같은 방식)
import type { ComponentType } from "react";

export type StudioId = "code" | "markdown" | "documents" | "skills" | "fake"; // fake = 시험 전용(?studioTest)
export interface StudioDef {
  id: StudioId;
  title: string;
  order: number;
  Component: ComponentType<{ arg?: string }>;
  /** 있으면 Tools 메뉴에 이 이름으로 나온다(Documents 는 없다) */
  tools?: { label: string };
}
const defs = new Map<string, StudioDef>();
export const registerStudio = (d: StudioDef): void => void defs.set(d.id, d);
export const getStudio = (id: string): StudioDef | undefined => defs.get(id);
export const allStudios = (): StudioDef[] => [...defs.values()].sort((a, b) => a.order - b.order);
export const resetStudios = (): void => defs.clear(); // 시험용
