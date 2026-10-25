// D9 → D13 이 채운다. D5 엔진이 start.ts 의 setGoalDeps 로 주입받는다 (S-1470)
import { ask } from "../memory/ask";
import { parseVerdict } from "../memory/parseFacts";
import { judgePrompt } from "../memory/prompts";
import type { Clock } from "../hidden/screen";
import type { Verdict } from "./goal";
import type { Loop } from "./types";

export const JUDGE_TIMEOUT_MS = 300_000; // 5분: 넘으면 판단 못 함

/** 숨은 세션에서 고른 에이전트에게 목표 달성 여부를 묻는다. MET → met, NOT MET → notMet, 그 밖·시간 초과·막힘·오류 → unknown */
export async function judgeGoal(loop: Loop, repo: string, o: { clock?: Clock; timeoutMs?: number } = {}): Promise<Verdict> {
  const g = loop.stop.goal;
  if (!g || g.mode !== "agent") return "unknown";
  try {
    const text = await ask({ agent: g.agent === "codex" ? "codex" : "claude", repo, prompt: judgePrompt(g.text), timeoutMs: o.timeoutMs ?? JUDGE_TIMEOUT_MS, clock: o.clock });
    return parseVerdict(text);
  } catch {
    return "unknown";
  }
}
