// S-550~S-552: @ 멘션 메뉴의 순수 부분(후보 거르기·수락 시 삽입 글)
export type MentionTarget = { kind: "everyone" | "console" | "group"; label: string; hint?: string };
export type MentionCtx = { consoles: { name: string; agent: string }[]; groups: { name: string }[] };

/** 커서 바로 앞의 `@글자` (공백 없이 이어진 것). 없으면 null */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  return m ? { start: m.index + m[1]!.length, query: m[2]! } : null;
}

const EVERYONE = ["everyone", "all", "everybody"]; // S-552
const wordStarts = (name: string, q: string) => name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q));

/** "Direct to" 후보: everyone, 콘솔, 그룹 순. query 로 걸러낸다(이름 또는 이름 속 단어의 앞부분, 대소문자 무시) */
export function candidates(ctx: MentionCtx, query: string): MentionTarget[] {
  const q = query.toLowerCase();
  const out: MentionTarget[] = [];
  if (EVERYONE.some((w) => w.startsWith(q))) out.push({ kind: "everyone", label: "everyone" });
  for (const c of ctx.consoles) if (wordStarts(c.name, q)) out.push({ kind: "console", label: c.name, hint: c.agent });
  for (const g of ctx.groups) if (wordStarts(g.name, q)) out.push({ kind: "group", label: g.name });
  return out;
}

/** `@query` 를 `@이름 ` 으로 바꾼 글과 새 커서 위치. 커서 뒤가 이미 공백이면 겹치지 않게 한다 */
export function accept(text: string, caret: number, start: number, t: MentionTarget): { text: string; caret: number } {
  const ins = `@${t.label} `;
  return { text: text.slice(0, start) + ins + text.slice(caret).replace(/^ /, ""), caret: start + ins.length };
}

/** S-551: 멘션만 있고 뒤 내용이 없으면 첫 멘션의 이름을, 아니면 null */
export function mentionOnly(text: string, ctx: MentionCtx): string | null {
  const names = [
    ...EVERYONE.map((m) => ({ m, out: "everyone" })),
    ...[...ctx.consoles.map((c) => c.name), ...ctx.groups.map((g) => g.name)].map((n) => ({ m: n.toLowerCase(), out: n })),
  ].sort((a, b) => b.m.length - a.m.length); // 긴 이름 먼저("Otto 2" 가 "Otto" 보다)
  let s = text.trim();
  let first: string | null = null;
  while (s) {
    if (!s.startsWith("@")) return null;
    const low = s.slice(1).toLowerCase();
    const hit = names.find((n) => low.startsWith(n.m) && (low.length === n.m.length || /\s/.test(low[n.m.length]!)));
    if (!hit) return null;
    first ??= hit.out;
    s = s.slice(1 + hit.m.length).trim();
  }
  return first;
}
