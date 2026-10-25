// E6 S-1975·S-1986·S-1988: 제목·표시 문구 순수 함수
import { pickerRows, transcriptLabel } from "../../agents/transcriptSupport";
import { t } from "../../i18n";
import type { DocMeta } from "../../lib/ipc";
import { DOCS } from "./prompts";

export const repoName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "<repo 이름> <문서 이름>" */
export const versionTitle = (repo: string, docId: string): string => `${cap(repo)} ${(DOCS.find((d) => d.id === docId)?.name ?? docId).split(" ").map(cap).join(" ")}`; // 예 "Votelanding Project Overview"(S-1986)
export const firstHeading = (md: string): string | null => /^# +(.+?)\s*$/m.exec(md)?.[1] ?? null;
export const freeTitle = (md: string): string => firstHeading(md) ?? "Custom document";
export const agentName = (id: string): string => transcriptLabel(id) ?? id;
export const effortName = (e: string): string => cap(e);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => String(n).padStart(2, "0");
/** "Oct 24, 14:03 · Claude Code · Balanced" */
export function versionLabel(m: DocMeta): string {
  const d = new Date(m.startedAt);
  return `${MON[d.getMonth()]} ${d.getDate()}, ${p2(d.getHours())}:${p2(d.getMinutes())} · ${agentName(m.agent)} · ${t(effortName(m.effort))}`;
}
export function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
export interface AgentRow { id: string; name: string; installed: boolean; why?: string }
/** S-1972·S-3150: Claude Code·Codex 는 늘 보임(없으면 흐림), Gemini·OpenCode 는 설치됐을 때만 그 뒤, 설치된 못 읽는 CLI 는 맨 뒤 회색 + 이유. 기본 에이전트가 claude·codex 면 맨 앞 */
export function agentRow(list: { id: string; installed: boolean; name?: string }[], defaultId: string): AgentRow[] {
  const rows = pickerRows(list.map((a) => ({ id: a.id, name: a.name ?? a.id, installed: a.installed })), ["claude", "codex"]).map((r): AgentRow => ({ id: r.id, name: r.name, installed: r.enabled, ...(r.why ? { why: r.why } : {}) }));
  const first = (id: string) => Number(id === defaultId && (id === "claude" || id === "codex"));
  return rows.sort((a, b) => first(b.id) - first(a.id));
}
/** 표지·카드의 날짜: "Oct 24, 2026" */
export const fmtDate = (ms: number): string => { const d = new Date(ms); return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
