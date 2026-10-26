// S-073: 콘솔별 글자 크기. 'global' 이면 전역 값(null)을 따른다(전역 설정 = useSettings.textSize, S-363).
import { registry, type BoardStore } from "../board/boards";
import { useBoard } from "../board/store";
import { isTauri } from "../lib/ipc";

export type TextSizeChoice = "global" | 85 | 100 | 115 | 130 | 150 | 175 | 200;

export const BASE_FONT_PX = 12.5; // S-134
// S-363: 노드 값이 없으면(null) 설정의 전체 배율(globalPct)을 따른다
export const fontSizeFor = (pct: number | null, globalPct = 100): number => (BASE_FONT_PX * (pct ?? globalPct)) / 100;
/** 141번 멈춘 콘솔: 멈출 때 화면(w0×h0, 글꼴 f0)을 지금 칸(w×h)에 넘치지 않게 키운(줄인) 글꼴. 0.5px 단위로 내림, 최소 6px */
export const zoomFont = (f0: number, w0: number, h0: number, w: number, h: number): number => Math.max(6, Math.floor(f0 * Math.min(w / w0, h / h0) * 2) / 2);

/** store 를 안 주면 그 노드를 가진 저장소를 찾는다(시험 후크용). 못 찾으면 기본 저장소 */
export function setConsoleTextSize(id: string, v: TextSizeChoice, store?: BoardStore): void {
  const s = store ?? [...registry.values()].find((r) => r.getState().nodes[id]) ?? useBoard;
  s.getState().updateNode(id, { textSize: v === "global" ? null : v });
}

if (typeof window !== "undefined" && !isTauri()) Object.assign(window, { __setTextSize: setConsoleTextSize });
