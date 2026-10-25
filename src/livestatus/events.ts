// S-685: hook 이벤트 → 상태 (순수). B16
export type LiveKind = "WORKING" | "NEEDS YOU" | "READY" | "ERROR";
export type LiveAgent = "claude" | "codex";
export type Payload = Record<string, unknown> | undefined;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const isAsk = (p: Payload) => str(p?.tool_name) === "AskUserQuestion";

/** null = 이 에이전트에서는 상태를 바꾸지 않는 이벤트 */
export function liveStatusOf(agent: LiveAgent, event: string, payload?: Payload): LiveKind | null {
  const claude = agent === "claude";
  switch (event) {
    case "UserPromptSubmit":
    case "PostToolUse":
      return "WORKING";
    case "PreToolUse":
      return claude && isAsk(payload) ? "NEEDS YOU" : "WORKING"; // 질문(Claude만)
    case "PermissionRequest":
      return "NEEDS YOU";
    case "Notification":
      return claude && payload?.notification_type !== "idle_prompt" ? "NEEDS YOU" : null; // 질문·권한 알림(Claude만). 한가함 알림은 READY 를 깨지 않는다
    case "SessionStart":
    case "Stop":
      return "READY";
    case "StopFailure":
      return claude ? "ERROR" : null;
    default:
      return null;
  }
}

const clip = (s: string, n = 120) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** S-687: 상태 pill 에 마우스를 올리면 보이는 글(실행 중 명령, 요청한 권한, 기다리는 질문) */
export function hoverText(_agent: LiveAgent, event: string, payload?: Payload): string | null {
  const tool = str(payload?.tool_name);
  const input = (payload?.tool_input ?? {}) as Record<string, unknown>;
  switch (event) {
    case "PreToolUse":
    case "PostToolUse": {
      if (isAsk(payload)) {
        const qs = input.questions;
        const q = Array.isArray(qs) ? str((qs[0] as Record<string, unknown> | undefined)?.question) : str(input.question);
        return `Waiting for your answer${q ? `: ${clip(q)}` : ""}`;
      }
      const cmd = str(input.command) || str(input.file_path) || str(input.pattern);
      return `Running ${tool || "a tool"}${cmd ? `: ${clip(cmd)}` : ""}`;
    }
    case "PermissionRequest":
      return `Asking permission${tool ? `: ${tool}` : ""}`;
    case "Notification":
      return clip(str(payload?.message)) || "Waiting for you";
    case "UserPromptSubmit":
      return "Working on your request";
    case "SessionStart":
      return "Ready";
    case "Stop":
      return "Done with the turn. Ready for your next message";
    case "StopFailure":
      return "The turn failed";
    default:
      return null;
  }
}
