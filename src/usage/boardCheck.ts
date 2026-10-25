// S-1518: 보드가 열릴 때마다(워크스페이스 전환 포함) 기본 에이전트 확인을 백그라운드로 건다(3분 안이면 useUsage 가 건너뜀)
import { agentsList, defaultAgent } from "../agents/api";
import type { useShell } from "../shell/useShell";
import { USAGE_AGENTS } from "./probe";
import { useUsage } from "./useUsage";

type Sh = ReturnType<typeof useShell.getState>;
/** 보드 화면이면 "repo|workspace", 아니면 null. 이 값이 바뀔 때마다 확인한다 */
export function boardKey(sh: Pick<Sh, "view" | "activeRepo" | "openRepos">): string | null {
  return sh.view === "board" && sh.activeRepo ? `${sh.activeRepo}|${sh.openRepos.find((r) => r.path === sh.activeRepo)?.activeWs ?? ""}` : null;
}
export async function checkOnBoardOpen(): Promise<void> {
  const [l, d] = await Promise.all([agentsList(), defaultAgent()]);
  const ok = (id: string) => USAGE_AGENTS.includes(id) && l.some((a) => a.id === id && a.installed);
  const first = ok(d) ? d : USAGE_AGENTS.find(ok);
  if (first) useUsage.getState().boardOpened([first]);
}
