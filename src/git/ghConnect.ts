// gh 로그인 상태와 "gh auth login 콘솔 놓기"(설정 Connections 와 Git 패널 Publish 절이 같이 쓴다).
import { create } from "zustand";
import { getStore } from "../board/boards";
import { useShell } from "../shell/useShell";
import { ghStatus, type GhStatus } from "../lib/ipc";

export const INSTALL = "winget install --id GitHub.cli";
export const useGh = create<{ st: GhStatus | null; refresh: () => Promise<void> }>((set) => ({
  st: null,
  refresh: async () => set({ st: await ghStatus().catch(() => ({ installed: false, user: null })) }),
}));

/** 열린 보드에 gh auth login 콘솔을 놓는다(앱은 아무것도 대신 입력하지 않는다). 콘솔이 닫히면 상태를 다시 읽는다 */
export function connectGh(wsId: string, onPlaced?: () => void): void {
  const sh = useShell.getState();
  if (sh.view === "home") sh.showWorkspace(wsId); // S-386: 홈이면 그 repo 의 보드로 먼저 전환(콘솔이 보이게)
  const store = getStore(wsId);
  const id = store.getState().spawnConsole("gh-auth-login");
  onPlaced?.();
  const off = store.subscribe((s) => { if (!s.nodes[id]) { off(); void useGh.getState().refresh(); } });
}

export async function copyInstall(): Promise<boolean> {
  try { await navigator.clipboard.writeText(INSTALL); return true; } catch { return false; } // 클립보드 막힘
}
