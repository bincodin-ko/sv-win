// D13 S-1383·S-1386·S-1470: 숨은 세션의 답 해석 (순수)
import type { Verdict } from "../loops/goal";
import { KINDS } from "./facts";

export type Proposal = { kind: string; title: string; body: string };
export const NO_FACTS = "No facts came back. Try again or pick another agent.";
const MAX_FACTS = 20, MAX_TITLE = 80, MAX_BODY = 600; // 한도는 추측(S-1383)

/** 글 안의 첫 JSON 값(open 으로 시작해 close 로 끝나는 덩어리 중 파싱되는 첫 것). 코드 펜스·앞뒤 글은 무시 */
function firstJson(text: string, open: "[" | "{", close: "]" | "}"): unknown {
  for (let a = text.indexOf(open); a >= 0; a = text.indexOf(open, a + 1)) {
    for (let b = text.lastIndexOf(close); b > a; b = text.lastIndexOf(close, b - 1)) {
      try {
        return JSON.parse(text.slice(a, b + 1));
      } catch { /* 더 짧게 */ }
    }
  }
  return undefined;
}

export function parseFacts(text: string): Proposal[] {
  const arr = firstJson(text, "[", "]");
  const out: Proposal[] = [];
  if (Array.isArray(arr)) {
    for (const x of arr as Record<string, unknown>[]) {
      if (out.length >= MAX_FACTS) break;
      if (!x || typeof x.kind !== "string" || !(KINDS as readonly string[]).includes(x.kind) || typeof x.title !== "string" || !x.title.trim()) continue;
      out.push({ kind: x.kind, title: x.title.trim().slice(0, MAX_TITLE), body: typeof x.body === "string" ? x.body.slice(0, MAX_BODY) : "" });
    }
  }
  if (!out.length) throw new Error(NO_FACTS);
  return out;
}

export type RefreshAnswer = { status: "ok" | "changed" | "gone"; body?: string };
export function parseRefresh(text: string): RefreshAnswer | null {
  const o = firstJson(text, "{", "}") as { status?: unknown; body?: unknown } | undefined;
  if (!o) return null;
  if (o.status === "ok" || o.status === "gone") return { status: o.status };
  if (o.status === "changed" && typeof o.body === "string" && o.body.trim()) return { status: "changed", body: o.body };
  return null;
}

/** MET / NOT MET 한 마디만 인정(대소문자·마침표·굵게 표시는 무시). 그 밖은 판단 못 함 */
export function parseVerdict(text: string): Verdict {
  const t = text.toUpperCase().replace(/[^A-Z ]/g, "").replace(/\s+/g, " ").trim();
  return t === "MET" ? "met" : t === "NOT MET" ? "notMet" : "unknown";
}
