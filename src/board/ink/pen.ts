import { create } from "zustand";
import { WIDTHS } from "./stroke";

/** 획을 그리는 중인가 — Board 의 Esc 가 도구를 끄지 않고 펜 층이 그 획만 버리게 한다(S-862) */
export const inking = { on: false };

/** 지금 펜 색(이름)·굵기. S-860 기본은 빨강·가운데 굵기 */
export const useInkPen = create<{ color: string; width: number; setColor: (c: string) => void; setWidth: (w: number) => void }>((set) => ({
  color: "red",
  width: WIDTHS[2],
  setColor: (color) => set({ color }),
  setWidth: (width) => set({ width }),
}));
