// D12 Accounts 화면용 순수 함수 (S-1622·S-1627·S-1632)
import type { Profile, ProfileAgent } from "../lib/ipc";
import { t } from "../i18n";

export type AccountRow = { id: string | null; name: string; sub: string; active: boolean };

export const AGENT_LABEL: Record<ProfileAgent, string> = { claude: "Claude", codex: "Codex" };

/** 배지에 붙는 이니셜 1~2자: 단어 머리글자 최대 둘(대문자) */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]!.toUpperCase())
    .join("");
}

/** 첫 줄 "Your sign-in"(id null) + 그 에이전트의 프로필 행들. used = settings.profileUse[agent] */
export function accountRows(profiles: Profile[], agent: ProfileAgent, used: string | null | undefined, signedIn: Record<string, boolean>): AccountRow[] {
  const mine = profiles.filter((p) => p.agent === agent);
  const cur = mine.some((p) => p.id === used) ? used! : null;
  return [
    { id: null, name: t("Your sign-in"), sub: t("Powering new {agent} lanes", { agent: AGENT_LABEL[agent] }), active: cur === null },
    ...mine.map((p) => ({ id: p.id, name: p.name, sub: signedIn[`${agent}/${p.id}`] ? t("Ready when you need it") : t("Not signed in yet"), active: cur === p.id })),
  ];
}
