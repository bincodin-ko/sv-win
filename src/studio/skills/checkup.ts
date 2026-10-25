// 5묶음 E7 S-2076: 점검(순수, AI 없음). 규칙 ①~⑦. 깨끗하면 빈 목록 — 화면이 NO_FINDINGS 를 보인다.
import { t, tm } from "../../i18n";
import { fieldKind } from "./fields";
import type { FVal, Parsed } from "./parse";

export interface Finding { rule: 1 | 2 | 3 | 4 | 5 | 6 | 7; level: "error" | "warn" | "info"; field: string; text: string }
export const NO_FINDINGS = tm("No findings. Name, description and size all look right.");
export const DESC_LIMIT = 1536;
export const BODY_LINES = 500;

/** ① 이름 규칙(New skill 폼이 입력 중에도 쓴다). 문제 없으면 null */
export const nameProblem = (name: string): string | null =>
  /^[a-z0-9-]+$/.test(name) && name.length <= 64 ? null : t("Use lowercase letters, numbers and hyphens only (64 characters max).");

const len = (v: FVal | undefined) => (Array.isArray(v) ? v.join(", ") : (v ?? "")).length;

export function checkup(p: Parsed, folderName: string): Finding[] {
  const out: Finding[] = [];
  const add = (rule: Finding["rule"], level: Finding["level"], field: string, text: string) => void out.push({ rule, level, field, text });
  const get = (k: string) => p.fields.find((f) => f[0] === k)?.[1];
  const bad = nameProblem(p.name);
  if (bad) add(1, "error", "name", bad);
  if (!p.description.trim()) add(2, "warn", "description", t("Add a description so Claude knows when to use this skill."));
  const total = len(get("description")) + len(get("when_to_use")) + len(get("argument-hint"));
  if (total > DESC_LIMIT) add(2, "warn", "description", t("Description and usage notes run {total} characters; the limit is {limit}.", { total, limit: DESC_LIMIT.toLocaleString("en-US") }));
  const lines = p.body.replace(/\n$/, "").split("\n").length;
  if (!p.body.trim()) add(3, "error", "body", t("The skill body is empty."));
  else if (lines > BODY_LINES) add(3, "warn", "body", t("The body is {lines} lines; keep it under {max}.", { lines, max: BODY_LINES }));
  if (get("name") !== undefined && p.name !== folderName) add(4, "warn", "name", t("The name '{name}' doesn't match its folder '{folder}'.", { name: p.name, folder: folderName }));
  for (const [k, v] of p.fields) {
    const kind = fieldKind(k);
    if (kind === "unknown") add(5, "info", k, t("'{field}' is an unknown field; Claude Code ignores it.", { field: k }));
    if (kind === "code-only") add(6, "warn", k, t("'{field}' is Claude Code-only; claude.ai and the API reject it on upload.", { field: k }));
    if (/[<>]/.test(Array.isArray(v) ? v.join(" ") : v)) add(7, "warn", k, t("'{field}' contains angle brackets (< or >); upload rejects them.", { field: k }));
  }
  return out;
}
