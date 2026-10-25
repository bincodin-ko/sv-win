// 내 에이전트 순수 규칙(S-376·S-378). 저장·목록은 api.ts 의 customAgentsGet/Set.
import { customAgentsGet, customAgentsSet, type AgentInfo } from "./api";
import { t } from "../i18n";

export interface CustomAgent { id: string; name: string; command: string }
export type Checked = { ok: true; agent: CustomAgent } | { ok: false; error: string };

/** 실행 명령을 공백으로만 나눈다(따옴표는 해석하지 않음) */
export const splitCommand = (command: string): string[] => command.split(/\s+/).filter(Boolean);

/** 이름이 비었거나(공백뿐) 겹치거나(내 목록·reserved = 내장·카탈로그 이름, 대소문자 무시) 명령이 비면 거절 */
export function validateAgent(list: CustomAgent[], reserved: string[], name: string, command: string): Checked {
  const n = name.trim();
  const c = splitCommand(command).join(" ");
  if (!n) return { ok: false, error: t("Enter a name.") };
  if (!c) return { ok: false, error: t("Enter the command to run.") };
  const taken = [...list.map((a) => a.name), ...reserved].some((x) => x.toLowerCase() === n.toLowerCase());
  if (taken) return { ok: false, error: t('An agent named "{name}" already exists.', { name: n }) };
  return { ok: true, agent: { id: `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: n, command: c } };
}

/** S-378: 고른 에이전트가 내장이 아닌 카탈로그 에이전트면 Your agents 에 더한다(이미 있으면 그대로) */
export async function noteCatalogPick(a: AgentInfo): Promise<void> {
  if (a.builtin || a.id.startsWith("custom:") || a.section === "yours") return;
  const cur = await customAgentsGet();
  if (!cur.some((c) => c.id === a.id)) await customAgentsSet([...cur, { id: a.id, name: a.name, command: a.command }]);
}
