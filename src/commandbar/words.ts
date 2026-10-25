// 숫자 말과 동의어 목록 (S-591, S-585, S-571)
const NUMS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** "3"/"three"/"a"/"an" -> 1..12, 아니면 null. 12 초과는 12, 0은 1. */
export function countOf(tok: string): number | null {
  const t = tok.toLowerCase();
  if (t === "a" || t === "an") return 1;
  const i = NUMS.indexOf(t);
  if (i >= 0) return i + 1;
  if (/^\d+$/.test(t)) return Math.min(12, Math.max(1, Number(t)));
  return null;
}

/** 내장 CLI 말 -> id (ctx.agents에 없어도 알아듣는다) */
export const BUILTIN_CLI: Record<string, string> = {
  claude: "claude",
  "claude code": "claude",
  codex: "codex",
  gemini: "gemini",
  // K8 S-2490: 한국어 이름(영어 키는 그대로)
  클로드: "claude",
  "클로드 코드": "claude",
  코덱스: "codex",
  제미니: "gemini",
  제미나이: "gemini",
};

/** 이 묶음에 없는 화면: 알아듣되 unavailable */
export const UNAVAILABLE = ["github"]; // 5묶음 E1 S-1807: documents·code·markdown·skills 는 이제 open 의도(스튜디오)
