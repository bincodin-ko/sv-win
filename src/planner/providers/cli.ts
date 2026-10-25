// 13묶음 R2 S-3310·S-3311: CLI 공급자별 숨은 세션 인자
// ponytail: 인자가 설치본에서 거부되면 여기만 고친다(대체: --disallowedTools Bash Edit Write Read Glob Grep WebFetch WebSearch Task). Codex·Gemini·OpenCode 는 [추측]
import { CLAUDE_LIGHT_ARGS } from "../../hidden/probe";
import type { ProviderId } from ".";

const OK = /^[A-Za-z0-9._:/@[\]-]{1,100}$/; // ConPTY 인용·인자 주입 방지
export function cliArgs(id: ProviderId, model: string): string[] {
  const m = OK.test(model) ? model : "";
  switch (id) {
    // 최종 확인 5번: --setting-sources project = 사용자 전역 설정·훅(effort 올림) 안 읽음, --strict-mcp-config + 빈 목록 = MCP 서버 안 띄움. 로그인은 그대로(2.1.310 실측 RAM 2176MB -> 292MB)
    case "claude": return ["--model", m || "haiku", "--effort", "low", "--tools", "", "--disable-slash-commands", ...CLAUDE_LIGHT_ARGS];
    case "codex": return [...(m ? ["-m", m] : []), "-s", "read-only", "-a", "never"];
    case "gemini": return m ? ["-m", m] : [];
    case "opencode": return ["--agent", "plan", ...(m ? ["-m", m] : [])];
    default: return [];
  }
}
