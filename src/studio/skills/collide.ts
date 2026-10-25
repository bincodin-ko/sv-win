// 5묶음 E7 S-2075: 이름이 겹치면 Personal > Project, 스킬 > 명령. 플러그인은 플러그인:이름이라 겹치지 않는다.
import { t } from "../../i18n";
export interface CollideItem { id: string; scope: "personal" | "project" | "plugin"; kind: "skill" | "command"; plugin?: string | null; name: string }

const rank = (i: CollideItem) => (i.kind === "command" ? 2 : 0) + (i.scope === "project" ? 1 : 0);
const label = (i: CollideItem) => (i.scope === "project" ? t("Project") : t("Personal"));

/** 진 쪽 id → "This one never runs: <이긴 쪽 범위> '<이름>' wins." */
export function collisions(items: CollideItem[]): Record<string, string> {
  const groups = new Map<string, CollideItem[]>();
  for (const i of items) if (i.scope !== "plugin") groups.set(i.name, [...(groups.get(i.name) ?? []), i]);
  const out: Record<string, string> = {};
  for (const g of groups.values()) {
    const [win, ...lose] = [...g].sort((a, b) => rank(a) - rank(b)); // 같은 등급은 먼저 온 쪽(안정 정렬)
    if (!win) continue;
    for (const l of lose) out[l.id] = t("This one never runs: {scope} '{name}' wins.", { scope: label(win), name: win.name });
  }
  return out;
}
