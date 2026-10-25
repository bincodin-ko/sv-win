// U2 S-2620~S-2622: 키보드 영역 순환 · 콘솔 읽기 순서 순환
import { getStore } from "../board/boards";
import { isConsole } from "../board/store";
import { useShell } from "./useShell";

export type Region = "board" | "bar" | "top" | "left" | "right";
export const REGIONS: Region[] = ["board", "bar", "top", "left", "right"];

const wrap = (i: number, n: number) => (i + n) % n;

/** 영역 다음/이전. 어느 영역도 아니면(null) 앞=보드, 뒤=오른쪽 레일 */
export function nextRegion(cur: Region | null, dir: 1 | -1): Region {
  if (!cur) return dir > 0 ? "board" : "right";
  return REGIONS[wrap(REGIONS.indexOf(cur) + dir, REGIONS.length)]!;
}

/** 읽기 순서: 위→아래, 같은 줄(첫 칸과 y 차이가 행 높이 절반 미만)이면 왼→오 */
export function readingOrder(nodes: { id: string; x: number; y: number; h: number }[]): string[] {
  const rows: (typeof nodes)[] = [];
  for (const n of [...nodes].sort((a, b) => a.y - b.y)) {
    const row = rows.at(-1);
    if (row && n.y - row[0]!.y < row[0]!.h / 2) row.push(n);
    else rows.push([n]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x)).map((n) => n.id);
}

/** ids 안에서 cur 의 다음/이전(끝에서 처음으로). cur 가 없으면 앞=첫째, 뒤=마지막 */
export function cycleId(ids: string[], cur: string | null, dir: 1 | -1): string | null {
  if (!ids.length) return null;
  const i = cur ? ids.indexOf(cur) : -1;
  if (i < 0) return (dir > 0 ? ids[0] : ids[ids.length - 1])!;
  return ids[wrap(i + dir, ids.length)]!;
}

// ---- DOM ----
const visibleWs = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-ws]:not([inert])");
const q = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);

function currentRegion(): Region | null {
  const a = document.activeElement as HTMLElement | null;
  if (!a) return null;
  if (a.dataset.testid === "bar-input") return "bar";
  if (a.closest('[data-testid="topbar"]')) return "top";
  if (a.closest('[data-testid="rail"]')) return "left";
  if (a.dataset.testid === "rail-presets" || a.closest('[data-testid="rail-presets-menu"]')) return "right";
  if (a.closest(".xterm") || a.closest('[data-testid="board"]')) return "board";
  return null;
}

const activeStore = () => {
  const s = useShell.getState();
  const ws = s.openRepos.find((r) => r.path === s.activeRepo)?.activeWs;
  return ws ? getStore(ws) : null;
};
const consoles = () => {
  const st = activeStore()?.getState();
  return st ? Object.values(st.nodes).filter(isConsole) : [];
};

/** 콘솔 하나를 선택하고 터미널에 포커스. 화면 밖이면 보드를 옮겨 보이게 */
function goConsole(id: string): void {
  const store = activeStore();
  const ws = visibleWs();
  const n = store?.getState().nodes[id];
  if (!store || !ws || !n) return;
  store.getState().select([id]);
  const board = q<HTMLElement>('[data-testid="board"]', ws);
  const { viewport: v, setViewport } = store.getState();
  if (board) {
    const w = board.clientWidth, h = board.clientHeight; // 화면점(가운데 기준) = world * zoom + (x, y)
    const sx = n.x * v.zoom + v.x, sy = n.y * v.zoom + v.y;
    const out = sx < -w / 2 || sy < -h / 2 || sx + n.w * v.zoom > w / 2 || sy + n.h * v.zoom > h / 2;
    if (out) setViewport({ ...v, x: -(n.x + n.w / 2) * v.zoom, y: -(n.y + n.h / 2) * v.zoom });
  }
  q<HTMLElement>(`[data-node-id="${id}"] .xterm-helper-textarea`, ws)?.focus();
}

function focusRegion(r: Region): void {
  const ws = visibleWs();
  if (r === "bar") q<HTMLElement>('[data-testid="bar-input"]')?.focus();
  else if (r === "top") q<HTMLElement>('[data-testid="topbar"] button:not([disabled]):not([tabindex="-1"])')?.focus();
  else if (r === "left") q<HTMLElement>('[data-testid="rail"] button:not([disabled])', ws ?? document)?.focus();
  else if (r === "right") q<HTMLElement>('[data-testid="rail-presets"]', ws ?? document)?.focus();
  else {
    // 보드: 선택 콘솔 → 첫 콘솔 → 보드 자체
    const cs = consoles();
    const sel = activeStore()?.getState().selection ?? [];
    const pick = cs.find((c) => sel.includes(c.id))?.id ?? readingOrder(cs.map((c) => ({ id: c.id, x: c.x, y: c.y, h: c.h })))[0];
    if (pick) return goConsole(pick);
    const board = q<HTMLElement>('[data-testid="board"]', ws ?? document);
    if (board) { board.tabIndex = -1; board.focus(); }
  }
}

export function cycleRegion(dir: 1 | -1): void {
  focusRegion(nextRegion(currentRegion(), dir));
}

export function focusCommandBar(): void {
  focusRegion("bar");
}

export function cycleConsole(dir: 1 | -1): void {
  const cs = consoles();
  const ids = readingOrder(cs.map((c) => ({ id: c.id, x: c.x, y: c.y, h: c.h })));
  const focused = (document.activeElement as HTMLElement | null)?.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null;
  const sel = activeStore()?.getState().selection ?? [];
  const next = cycleId(ids, focused && ids.includes(focused) ? focused : ids.find((i) => sel.includes(i)) ?? null, dir);
  if (next) goConsole(next);
}
