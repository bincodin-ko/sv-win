// D5 S-1409 대상 해석. card 는 D1 wiredTargets(그룹 id → 지금 멤버, 사라진 id 무시, 한 번씩)
import type { Group } from "../board/groups";
import { wiredTargets } from "../board/wired";
import type { BoardNode } from "../board/store";
import type { Target } from "./types";

const consoleIds = (nodes: Record<string, BoardNode>) => Object.values(nodes).filter((n) => n.kind === "console").map((n) => n.id);

/** 한 워크스페이스 노드들에서 대상 콘솔 노드 id */
export function targetNodeIds(t: Target, nodes: Record<string, BoardNode>, groups: Group[] = []): string[] {
  if (t.kind === "all") return consoleIds(nodes);
  if (t.kind === "pick") return t.ids.filter((id) => nodes[id]?.kind === "console");
  const card = nodes[t.id];
  return card ? wiredTargets(nodes, groups, card).consoles : [];
}
