// H3 보드에 놓기: 고른 대화를 원래 폴더·프로필로 `--resume` 콘솔로 (S-2840~S-2846)
import { getStore, registry } from "../board/boards";
import { isConsole, type BoardNode } from "../board/store";
import { fitBounds } from "../board/viewport";
import { markResumeFirst } from "../console/offers";
import { sessionKey } from "../console/sessionKey";
import { t } from "../i18n";
import type { Conversation } from "../lib/ipc";
import { showNotice } from "../lib/notice";
import { useShell } from "../shell/useShell";
import { createHub } from "../shell/workspaces";
import { useUi } from "../ui/useUi";
import { setPlaceHandler } from "./ConversationsScreen";
import { canPlace } from "./group";

export type PlacedAt = { wsId: string; nodeId: string };

/** 열린 보드 저장소들에서 같은 cli·같은 대화 id 를 가진 콘솔 */
export function findPlaced(stores: Map<string, { nodes: Record<string, BoardNode> }>, conv: Pick<Conversation, "cli" | "sessionId">): PlacedAt | null {
  for (const [wsId, s] of stores)
    for (const n of Object.values(s.nodes)) {
      if (!isConsole(n) || n.agentId !== conv.cli) continue;
      const r = n.resume as { claudeSessionId?: string; codexSessionId?: string } | undefined;
      if ((conv.cli === "claude" ? r?.claudeSessionId : r?.codexSessionId) === conv.sessionId) return { wsId, nodeId: n.id };
    }
  return null;
}

/** 놓을 보드: 보이는 보드 → 없으면 activeRepo 의 activeWs → 없으면 null (보이는 보드도 activeRepo 의 activeWs 라 한 식) */
export function targetWs(shell: { view: "home" | "board"; activeRepo: string | null; openRepos: { path: string; activeWs: string | null }[] }): string | null {
  return shell.openRepos.find((r) => r.path === shell.activeRepo)?.activeWs ?? null;
}

export async function placeConversation(conv: Conversation): Promise<void> {
  if (canPlace(conv)) return; // 단추가 이미 비활성
  const shell = useShell.getState;
  const found = findPlaced(new Map([...registry].map(([id, s]) => [id, s.getState()])), conv);
  if (found) {
    shell().showWorkspace(found.wsId);
    const st = registry.get(found.wsId)!.getState();
    const n = st.nodes[found.nodeId];
    st.select([found.nodeId]);
    if (isConsole(n)) st.setViewport(fitBounds({ x: n.x, y: n.y, w: n.w, h: n.h }, { w: window.innerWidth, h: window.innerHeight }));
    useUi.getState().closeConversations();
    showNotice(t("Already on a board — jumped to it"));
    return;
  }
  const wsId = targetWs(shell()) ?? (await createHub()).id;
  const store = getStore(wsId).getState();
  const id = store.spawnConsole(conv.cli, undefined, { cwd: conv.cwd!, profile: conv.profile });
  // 노드가 마운트되기 전(같은 동기 흐름)에 이어가기 표시를 건다: createSession 이 마운트 때 읽는다
  store.updateNode(id, { resume: conv.cli === "claude" ? { claudeSessionId: conv.sessionId } : { codexSessionId: conv.sessionId } });
  markResumeFirst(sessionKey(wsId, id), conv.sessionId);
  useUi.getState().closeConversations();
  shell().showWorkspace(wsId);
  store.select([id]);
}

setPlaceHandler((c) => void placeConversation(c));
