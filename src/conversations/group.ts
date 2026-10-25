// H2 S-2824~S-2832: 대화 목록 거르기·묶기 순수 함수.
import type { Conversation } from "../lib/ipc";
import { t, type Lang } from "../i18n";

export type CliFilter = "all" | "claude" | "codex";
export type GroupMode = "folder" | "date";
export type Row = { kind: "head"; key: string; label: string; sub?: string; count: number } | { kind: "conv"; conv: Conversation };

const trimSep = (p: string) => p.replace(/[\\/]+$/, "");
/** S-2826: 소문자·`/`→`\`·끝 구분자 제거 */
export const sameFolderKey = (cwd: string): string => trimSep(cwd.toLowerCase().replace(/\//g, "\\").replace(/\\+/g, "\\"));
const baseName = (p: string) => p.split(/[\\/]/).pop() || p;

/** S-2825: 제목·첫 메시지·폴더 경로에서 대소문자 무시 부분 일치 + CLI 거르기 */
export function filterConvs(list: Conversation[], o: { q: string; cli: CliFilter }): Conversation[] {
  const q = o.q.trim().toLowerCase();
  return list.filter((c) => (o.cli === "all" || c.cli === o.cli) && (!q || [c.title, c.firstPrompt, c.cwd ?? ""].some((s) => s.toLowerCase().includes(q))));
}

export function groupRows(list: Conversation[], mode: GroupMode, now: number, lang: Lang): Row[] {
  const sorted = [...list].sort((a, b) => b.lastAt - a.lastAt);
  const groups = new Map<string, { label: string; sub?: string; items: Conversation[] }>();
  const add = (key: string, label: string, sub: string | undefined, c: Conversation) => {
    const g = groups.get(key);
    if (g) g.items.push(c);
    else groups.set(key, { label, sub, items: [c] });
  };
  if (mode === "folder") {
    for (const c of sorted) {
      if (c.cwd) { const p = trimSep(c.cwd); add(sameFolderKey(c.cwd), baseName(p), p, c); }
      else add("", t("No folder"), undefined, c);
    }
    // 입력이 최근 순이라 Map 삽입 순서 = 묶음 순서. No folder 만 맨 아래로
    const none = groups.get("");
    if (none) { groups.delete(""); groups.set("", none); }
  } else {
    const d = new Date(now);
    const sod = (n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - n).getTime();
    const cuts: [number, string][] = [[0, "Today"], [1, "Yesterday"], [7, "Previous 7 days"], [30, "Previous 30 days"]];
    for (const c of sorted) {
      const hit = cuts.find(([n]) => c.lastAt >= sod(n));
      if (hit) add(hit[1], t(hit[1]), undefined, c);
      else {
        const dt = new Date(c.lastAt);
        add(`${dt.getFullYear()}-${dt.getMonth()}`, dt.toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: "long" }), undefined, c);
      }
    }
  }
  const rows: Row[] = [];
  for (const [key, g] of groups) {
    rows.push({ kind: "head", key, label: g.label, ...(g.sub ? { sub: g.sub } : {}), count: g.items.length });
    for (const conv of g.items) rows.push({ kind: "conv", conv });
  }
  return rows;
}

/** S-2832: 놓기 불가 이유(없으면 null) */
export const canPlace = (c: Conversation): null | "noFolder" | "missing" => (!c.cwd ? "noFolder" : !c.cwdExists ? "missing" : null);
