// S-2900: Settings 'Planner' 줄의 순수 계산
import { agentsList } from "../../agents/api";
import { isTauri } from "../../lib/ipc";
import { isApi } from "../../planner/providers";
import { plannerAgent, plannerChoices } from "../../planner/state";

export function plannerRowView(setting: unknown, installed: string[]): { value: string; cli: string[]; api: string[] } {
  const ids = plannerChoices(installed).filter((c) => c !== "off");
  return { value: plannerAgent(typeof setting === "string" ? setting : "claude", installed), cli: ids.filter((c) => !isApi(c)), api: ids.filter(isApi) };
}

/** 설치된 에이전트 id. 비Tauri 시험은 localStorage "symvibe.fakePlannerInstalled"로 덮을 수 있다 */
export async function installedIds(): Promise<string[]> {
  if (!isTauri()) {
    try { const v = localStorage.getItem("symvibe.fakePlannerInstalled"); if (v) return JSON.parse(v); } catch { /* 기본 가짜 목록 */ }
  }
  return (await agentsList()).filter((a) => a.installed).map((a) => a.id);
}
