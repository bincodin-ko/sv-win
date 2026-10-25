// S-958·S-959·S-962: 카드를 만드는 함수(C15 드롭이 부른다). placeNew(store, "code", makeCode(path, text), at) 처럼 opts 로 넘긴다.
import { clipForStore } from "./clip";

export const EXPLORER_MAX = 40;
/** 경로(\ 또는 /)의 마지막 이름 */
export const baseName = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? p;

export const makeCode = (path: string, text: string): Record<string, unknown> => ({ path, name: baseName(path), ...clipForStore(text) });
export const makeMarkdown = (path: string): Record<string, unknown> => ({ path, name: baseName(path) });
export const makeExplorer = (dir: string, files: string[]): Record<string, unknown> => {
  const list = files.slice(0, EXPLORER_MAX);
  return { dir, name: baseName(dir), files: list, selected: list[0] ?? "" };
};
