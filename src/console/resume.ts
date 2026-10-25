// A9 Resume 순수 로직: 제안 대상 고르기(S-236), 8초 규칙(S-240), resume 인자(Rust agents.rs 와 같은 규칙)
export type ResumeInfo = { claudeSessionId?: string; codexSessionId?: string; lastChatAt?: number };
export type ConsoleLike = { id: string; agentId: string; resume?: ResumeInfo };
export type Offer = { nodeId: string; agentId: string; sessionId?: string };

export const QUICK_EXIT_MS = 8000;

/** S-236: 어느 콘솔에 "Resume last conversation?" 을 제안하나 */
export function pickOffers(nodes: ConsoleLike[], o: { enabled: boolean; transcriptExists: (sessionId: string) => boolean }): Offer[] {
  if (!o.enabled) return [];
  const out: Offer[] = [];
  for (const n of nodes) {
    const id = n.agentId === "claude" ? n.resume?.claudeSessionId : n.agentId === "codex" ? n.resume?.codexSessionId : undefined;
    if (!id) continue;
    // Claude 는 transcript 가 디스크에 있어야 한다. Codex 는 자기 세션 id 만(S-236)
    if (n.agentId === "claude" && !o.transcriptExists(id)) continue;
    out.push({ nodeId: n.id, agentId: n.agentId, sessionId: id });
  }
  // Gemini·OpenCode: 에이전트별로 마지막에 대화한 콘솔 1개
  for (const agentId of ["gemini", "opencode"]) {
    let best: ConsoleLike | undefined;
    for (const n of nodes) if (n.agentId === agentId && n.resume?.lastChatAt && n.resume.lastChatAt > (best?.resume?.lastChatAt ?? 0)) best = n;
    if (best) out.push({ nodeId: best.id, agentId });
  }
  return out;
}

/** S-240: Claude·Codex 의 resume 프로세스가 8초 안에 끝났나(→ 배너가 다시 뜸) */
export function exitedQuickly(agentId: string, startedAt: number, endedAt: number): boolean {
  return (agentId === "claude" || agentId === "codex") && endedAt - startedAt <= QUICK_EXIT_MS;
}

/** S-235: 제안이 2개 이상이면 "Resume all conversations?" */
export const needsResumeAll = (offers: Offer[]): boolean => offers.length >= 2;

/** S-236·S-237: kind "resume" = 이어가기, "new" = Claude 새 시작(--session-id) */
export function cliResumeArgs(agentId: string, kind: "resume" | "new", sessionId?: string): string[] {
  if (kind === "new") return agentId === "claude" && sessionId ? ["--session-id", sessionId] : [];
  switch (agentId) {
    case "claude": return sessionId ? ["--resume", sessionId] : [];
    case "codex": return sessionId ? ["resume", sessionId] : [];
    case "gemini": return ["--resume", "latest"];
    case "opencode": return ["--continue"];
    default: return [];
  }
}

/** S-233 메모 */
export const restoredMemo = (agentName: string): string => `${agentName} lane restored — relaunching`;
/** S-234 메모 */
export const pickingMemo = (agentName: string): string => `${agentName} lane — picking your last chat…`;
