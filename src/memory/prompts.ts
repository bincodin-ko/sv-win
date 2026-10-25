// D13 S-1381·S-1386·S-1470: 숨은 세션에 보낼 영어 프롬프트 (순수). 한 줄로 접혀 들어가므로 줄바꿈에 기대지 않는다
import { KINDS } from "./facts";

export type Quality = "quick" | "balanced" | "thorough";
export const QUALITY_COUNT: Record<Quality, number> = { quick: 6, balanced: 10, thorough: 14 };

export function scanPrompt(q: Quality): string {
  return [
    "Read this repository and write a briefing of facts a coding agent should know before working here.",
    "Do not change any file; only read.",
    `Propose about ${QUALITY_COUNT[q]} facts. Pick each fact's kind from: ${KINDS.join(", ")}.`,
    'Reply with only one JSON array, no other text: [{"kind","title","body"}] where title is a short label and body is one to three plain sentences.',
  ].join(" ");
}
export function refreshPrompt(f: { kind: string; title: string; body: string }): string {
  return [
    "Check whether this saved fact about the repository is still accurate. Do not change any file; only read.",
    `Fact (${f.kind}) "${f.title}": ${f.body.replace(/\s+/g, " ")}`,
    'Reply with only one JSON object, no other text: {"status":"ok"} if it is still true, {"status":"changed","body":"<corrected text>"} if it needs a new text, or {"status":"gone"} if it is no longer true.',
  ].join(" ");
}
export function judgePrompt(goal: string): string {
  return [
    `Goal: ${goal.replace(/\s+/g, " ")}`,
    "Look at the repository and decide whether this goal is met right now. Do not run any command and do not change any file.",
    "Answer with only MET or NOT MET.",
  ].join(" ");
}
