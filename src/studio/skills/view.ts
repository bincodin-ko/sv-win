// 5묶음 E7: 화면이 같이 쓰는 것 — 읽은 스킬(파싱·점검·이름 겹침 붙인 것), 필터 분류, 공통 스타일
import type { CSSProperties } from "react";
import { t, tm } from "../../i18n";
import type { SkillEntry } from "../../lib/ipc";
import { checkup, type Finding } from "./checkup";
import { collisions } from "./collide";
import { parseSkill, type Parsed } from "./parse";

export interface Row { e: SkillEntry; p: Parsed; id: string; findings: Finding[]; loser?: string }
export type Cat = "personal" | "project" | "plugins" | "commands";
export const CATS: { id: Cat; label: string }[] = [{ id: "personal", label: tm("Personal") }, { id: "project", label: tm("Project") }, { id: "plugins", label: tm("Plugins") }, { id: "commands", label: tm("Commands") }];

/** 경로 비교용(슬래시·대소문자 무시) */
export const pkey = (p: string): string => p.replace(/\\/g, "/").toLowerCase();
export const catOf = (e: SkillEntry): Cat => (e.plugin || e.scope === "plugin" ? "plugins" : e.kind === "command" ? "commands" : e.scope);
export const badgeOf = (e: SkillEntry): string => (e.scope === "plugin" ? t("Plugin") : e.kind === "command" ? t("Command") : e.scope === "project" ? t("Project") : t("Personal"));

export function toRows(entries: SkillEntry[]): Row[] {
  const rows = entries.map((e) => {
    const p = parseSkill(e.raw, e.folderName);
    return { e, p, id: pkey(e.path), findings: checkup(p, e.folderName) } as Row;
  });
  const lose = collisions(rows.map((r) => ({ id: r.id, scope: r.e.scope, kind: r.e.kind, plugin: r.e.plugin, name: r.p.name })));
  rows.forEach((r) => { r.loser = lose[r.id]; });
  return rows.sort((a, b) => a.p.name.localeCompare(b.p.name));
}
export const isRow = (r: Row, key: string | null): boolean => !!key && (r.id === key || pkey(r.e.dir) === key);

export const btn: CSSProperties = { padding: "5px 12px", borderRadius: 6, border: "1px solid var(--bd-2)", background: "var(--surface-2)", color: "var(--fg)", font: "13px system-ui", cursor: "pointer" };
export const primary: CSSProperties = { ...btn, border: 0, background: "var(--accent)", color: "var(--accent-text)" };
export const field: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--bd-2)", background: "var(--skill-code-bg)", color: "var(--fg)", font: "13px system-ui" };
export const mono: CSSProperties = { font: "12px/1.5 ui-monospace, Consolas, monospace" };
export const errText: CSSProperties = { color: "var(--err-text)", fontSize: 12 };
