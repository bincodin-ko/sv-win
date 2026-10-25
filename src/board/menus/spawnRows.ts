// 우클릭 링 '에이전트 생성': 고르기 화면(pickerRows)과 같은 규칙 — 미설치는 회색 + 이유. Shell 은 늘 가능.
import type { AgentInfo } from "../../agents/api";
import { t } from "../../i18n";

export interface SpawnRow { id: string; name: string; why?: string }

export function spawnRows(list: AgentInfo[]): SpawnRow[] {
  // 링은 콘솔을 띄울 뿐이라 기록 읽기와 무관: 미설치만 회색(Shell 은 늘 가능)
  return list.filter((a) => a.builtin).map((a) => a.installed || a.id === "shell" ? { id: a.id, name: a.name } : { id: a.id, name: a.name, why: t("Not installed yet") });
}
