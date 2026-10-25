// E6 S-1975·S-1986·S-1988: 제목·표시 문구 순수 함수
import { t } from "../../i18n";
import type { DocMeta } from "../../lib/ipc";
import { DOCS } from "./prompts";

export const repoName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "<repo 이름> <문서 이름>" */
export const versionTitle = (repo: string, docId: string): string => `${cap(repo)} ${(DOCS.find((d) => d.id === docId)?.name ?? docId).split(" ").map(cap).join(" ")}`; // 예 "Votelanding Project Overview"(S-1986)
export const firstHeading = (md: string): string | null => /^# +(.+?)\s*$/m.exec(md)?.[1] ?? null;
export const freeTitle = (md: string): string => firstHeading(md) ?? "Custom document";
export const agentName = (id: string): string => (id === "claude" ? "Claude Code" : id === "codex" ? "Codex" : id);
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
export interface AgentRow { id: string; name: string; installed: boolean }
/** S-1972: Claude Code·Codex 만. 기본 에이전트가 그중 하나면 맨 앞. 목록에 없으면 설치 안 된 것 */
export function agentRow(list: { id: string; installed: boolean }[], defaultId: string): AgentRow[] {
  const rows = ["claude", "codex"].map((id) => ({ id, name: agentName(id), installed: list.find((a) => a.id === id)?.installed === true }));
  return rows.sort((a, b) => Number(b.id === defaultId) - Number(a.id === defaultId));
}
/** 표지·카드의 날짜: "Oct 24, 2026" */
export const fmtDate = (ms: number): string => { const d = new Date(ms); return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
