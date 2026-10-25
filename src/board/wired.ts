// S-1220~S-1222: 카드의 wired[] 순수 함수. 항목 = 콘솔 노드 id 또는 그룹 id
import type { Group } from "./groups";
import type { BoardNode } from "./store";

/** 그룹 id 는 지금 멤버 콘솔로 펼치고, 사라진 id 는 무시하고, 같은 콘솔은 한 번만 센다(S-1221). groups = 살아 있는 그룹 id */
export function wiredTargets(nodes: Record<string, BoardNode>, groups: Group[], card: BoardNode): { consoles: string[]; groups: string[] } {
  const consoles = new Set<string>(), gs: string[] = [];
  for (const id of (card.wired as string[] | undefined) ?? []) {
    if (groups.some((g) => g.id === id)) {
      gs.push(id);
      for (const n of Object.values(nodes)) if (n.kind === "console" && n.groupId === id) consoles.add(n.id);
    } else if (nodes[id]?.kind === "console") consoles.add(id);
  }
  return { consoles: [...consoles], groups: gs };
}
/** 있으면 빼고 없으면 끝에 붙인 새 배열(S-1226). 입력은 안 바꾼다 */
export function toggleWired(wired: string[] | undefined, id: string): string[] {
  const w = wired ?? [];
  return w.includes(id) ? w.filter((x) => x !== id) : [...w, id];
}
/** gone 에 든 id 를 뺀 새 배열(S-1222) */
export function pruneWired(wired: string[] | undefined, gone: string[]): string[] {
  return (wired ?? []).filter((x) => !gone.includes(x));
}
