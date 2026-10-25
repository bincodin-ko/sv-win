// A9: Resume 제안 상태(콘솔별 배너) + 불러온 보드의 복원 표시 + repo 경로
import { create } from "zustand";
import { settingsGet } from "../agents/api";
import { isConsole, type BoardNode } from "../board/store";
import { claudeTranscriptExists } from "../lib/ipc";
import { consoleProfile } from "../profiles/env";
import { pickOffers, type Offer } from "./resume";
import { sessionKey } from "./sessionKey";

type OfferState = {
  offers: Record<string, Offer>;
  set: (list: Offer[]) => void;
  add: (o: Offer) => void;
  drop: (nodeId: string) => void;
  clear: () => void;
};
export const useOffers = create<OfferState>((set) => ({
  offers: {},
  set: (list) => set((s) => ({ offers: { ...s.offers, ...Object.fromEntries(list.map((o) => [o.nodeId, o])) } })), // B2: nodeId 칸 = 합성 키. 다른 워크스페이스 제안은 지우지 않는다
  add: (o) => set((s) => ({ offers: { ...s.offers, [o.nodeId]: o } })),
  drop: (nodeId) =>
    set((s) => {
      if (!s.offers[nodeId]) return s;
      const { [nodeId]: _gone, ...rest } = s.offers;
      return { offers: rest };
    }),
  clear: () => set({ offers: {} }),
}));

// 불러온 보드의 콘솔 id. 첫 시작 한 번만 "lane restored" 메모와 제안을 쓴다(S-233)
const restored = new Set<string>();
export const takeRestored = (key: string): boolean => restored.delete(key);

const repoPaths = new Map<string, string>(); // wsId → repo 경로
export const setRepoPath = (p: string | null, wsId = "") => void (p ? repoPaths.set(wsId, p) : repoPaths.delete(wsId));
export const getRepoPath = (wsId = "") => repoPaths.get(wsId);

/** 보드를 불러온 직후, 콘솔이 마운트되기 전에 부른다: 복원 표시 + 제안 계산 (S-233·S-236) */
export async function prepareRestore(wsId: string, nodes: Record<string, BoardNode>): Promise<void> {
  const repoPath = getRepoPath(wsId);
  const cons = Object.values(nodes).filter(isConsole);
  cons.forEach((c) => restored.add(sessionKey(wsId, c.id)));
  const enabled = (await settingsGet()).resumeAgentChats !== false;
  const ok = new Set<string>();
  if (enabled && repoPath)
    await Promise.all(
      cons.flatMap((c) => {
        const id = c.agentId === "claude" ? (c.resume as { claudeSessionId?: string } | undefined)?.claudeSessionId : undefined;
        return id ? [consoleProfile("claude", c.profile).then((cp) => claudeTranscriptExists(repoPath, id, cp.dir)).then((e) => e && ok.add(id))] : [];
      }),
    );
  useOffers.getState().set(pickOffers(cons.map((c) => ({ id: c.id, agentId: c.agentId, resume: c.resume as never })), { enabled, transcriptExists: (s) => ok.has(s) }).map((o) => ({ ...o, nodeId: sessionKey(wsId, o.nodeId) })));
}
