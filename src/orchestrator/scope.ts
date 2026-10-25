// S-1260·S-1261: 카드 명령의 범위 제한
import type { Group } from "../board/groups";
import { t, tm } from "../i18n";
import type { BoardNode } from "../board/store";
import { wiredTargets } from "../board/wired";
import type { Intent, Target } from "../commandbar/intent";
import { sessionKey } from "../console/sessionKey";

/** sessionKey(wsId, 노드 id) 목록: 지휘 콘솔과 지휘 그룹 */
export type OrchScope = { consoles: string[]; groups: string[]; card?: string };
export const NOT_CONNECTED = tm("That mention is not connected to this orchestrator");
export const MAIN_BAR_ONLY = tm("Undo, redo and workspace commands work from the main command bar.");

export const MAIN_BAR_ONLY_4 = tm("That works from the main command bar.");

export function scopeOf(wsId: string, nodes: Record<string, BoardNode>, groups: Group[], card: BoardNode): OrchScope {
  const t = wiredTargets(nodes, groups, card);
  return { consoles: t.consoles.map((id) => sessionKey(wsId, id)), groups: t.groups.map((id) => sessionKey(wsId, id)), card: sessionKey(wsId, card.id) };
}
const outside = (t: Target | undefined, s: OrchScope): boolean =>
  !!t && ((t.kind === "console" && !s.consoles.includes(t.id)) || (t.kind === "group" && !s.groups.includes(t.id)));

/** 카드에서 하면 안 되는 말이면 답 글(화면 언어), 아니면 null. 대상 없는 말은 통과(실행기가 지휘 콘솔 안에서만 고른다) */
export function guard(i: Intent, s: OrchScope): string | null {
  const r = guardKey(i, s);
  return r === null ? null : t(r);
}
function guardKey(i: Intent, s: OrchScope): string | null {
  switch (i.t) {
    case "undo": case "redo": case "workspace": case "theme": return MAIN_BAR_ONLY;
    case "open": return i.what === "settings" || i.what === "presets" ? null : MAIN_BAR_ONLY_4; // S-1739
    case "addOrchestrator": case "connect": case "loop": return MAIN_BAR_ONLY_4;
    case "tell": return i.targets.some((t) => outside(t, s)) ? NOT_CONNECTED : null;
    case "pause": case "resume": case "restart": case "close": case "camera": return outside(i.target, s) ? NOT_CONNECTED : null;
    case "addToGroup": return s.groups.includes(i.groupId) ? null : NOT_CONNECTED;
    default: return null;
  }
}
