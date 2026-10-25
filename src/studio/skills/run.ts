// 5묶음 E7 S-2084: Run on an agent — 보낼 글과 대상 고르기(순수). 입력·제출은 console/submit.ts typeAndSubmit.
import { tm } from "../../i18n";
export const NEED_AGENT = tm("Start an agent first.");
export interface NodeLike { kind?: string; agentId?: string; name?: string }

/** `/이름 인자`, 플러그인은 `/플러그인:이름 인자`. 인자의 줄바꿈은 공백으로 */
export const runText = (plugin: string | null | undefined, name: string, args: string): string =>
  [`/${plugin ? `${plugin}:` : ""}${name}`, args.replace(/\s*[\r\n]+\s*/g, " ").trim()].filter(Boolean).join(" ");

/** 보드에서 지금 에이전트가 실행 중인 Claude Code 콘솔(노드 순서). running = 세션이 에이전트를 돌리는가 */
export const claudeConsoles = (nodes: Record<string, NodeLike>, running: (id: string) => boolean): { id: string; name: string }[] =>
  Object.entries(nodes).filter(([id, n]) => n.kind === "console" && n.agentId === "claude" && running(id)).map(([id, n]) => ({ id, name: n.name ?? id }));
