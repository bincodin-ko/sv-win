// D14 S-1680~S-1705: Handoff·Forward 공용 타입. 실제 콘솔·Thread 연결은 D15 가 Deps 로 주입한다.
import type { Writable } from "../console/submit";
import type { DTarget } from "../commandbar/deliver";
import type { Snap } from "../commandbar/report";

/** S-1680: 대상 CLI 는 내장 5종만 */
export const CLIS = ["claude", "codex", "gemini", "grok", "opencode"] as const;
export const CLI_NAMES: Record<string, string> = { claude: "Claude Code", codex: "Codex", gemini: "Gemini", grok: "Grok", opencode: "OpenCode" };

export interface Clock { now(): number; sleep(ms: number): Promise<void> }
export interface Base extends Clock {
  /** Thread 에 봇/계획 노트 한 줄 */
  say(text: string): void;
  /** 한 줄 붙여넣기 + Enter (기본 typeAndSubmit) */
  submit(w: Writable, text: string): Promise<unknown>;
}
export interface HSession extends DTarget {
  fetchReply(): Promise<string | null>;
  lastDataAt(): number;
}
export type { Snap, DTarget, Writable };
