// 5묶음 E7 S-2072·S-2079: 머리말 읽기(순수)·새 스킬 글 만들기. 문법 범위는 추측: `키: 값`, 따옴표, `>`·`|` 여러 줄, `[a, b]`·`- a` 목록. 모르는 키도 순서대로 보존.
export type FVal = string | string[];
export interface Parsed { name: string; description: string; fields: [string, FVal][]; body: string; hasFrontmatter: boolean }

const unquote = (v: string): string => {
  const t = v.trim();
  if (t.length >= 2 && t[0] === '"' && t.at(-1) === '"') return t.slice(1, -1).replace(/\\(["\\])/g, "$1");
  if (t.length >= 2 && t[0] === "'" && t.at(-1) === "'") return t.slice(1, -1).replace(/''/g, "'");
  return t;
};
const indentOf = (l: string) => l.length - l.trimStart().length;

export function parseSkill(raw: string, fallbackName: string): Parsed {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const end = lines[0]?.trim() === "---" ? lines.findIndex((l, i) => i > 0 && l.trimEnd() === "---") : -1;
  if (end < 0) return { name: fallbackName, description: "", fields: [], body: text, hasFrontmatter: false };
  const fm = lines.slice(1, end);
  const at = (n: number) => fm[n] ?? "";
  const fields: [string, FVal][] = [];
  for (let i = 0; i < fm.length; i++) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(at(i));
    if (!m) continue;
    const key = m[1]!, rest = m[2]!;
    const val = rest.trim();
    // 다음 줄들 중 이 값에 딸린 것(들여쓴 줄·빈 줄, 목록은 들여쓰지 않은 `- ` 도)
    const block = (): string[] => {
      const out: string[] = [];
      while (i + 1 < fm.length && (at(i + 1).trim() === "" || /^\s/.test(at(i + 1)) || /^- /.test(at(i + 1)))) out.push(at(++i));
      while (out.length && out.at(-1)!.trim() === "") out.pop();
      return out;
    };
    if (/^[>|][+-]?$/.test(val)) {
      const b = block(), ind = Math.min(...b.filter((l) => l.trim()).map(indentOf), 99);
      const ls = b.map((l) => l.slice(Math.min(ind, indentOf(l))));
      fields.push([key, val[0] === ">" ? ls.map((l) => l.trim()).filter(Boolean).join(" ") : ls.join("\n")]);
    } else if (val === "") {
      const b = block().filter((l) => l.trim());
      if (b.length && b.every((l) => l.trim().startsWith("- "))) fields.push([key, b.map((l) => unquote(l.trim().slice(2)))]);
      else fields.push([key, b.map((l) => l.slice(Math.min(...b.map(indentOf)))).join("\n")]);
    } else if (key !== "argument-hint" && val.startsWith("[") && val.endsWith("]")) {
      fields.push([key, val.slice(1, -1).split(",").map(unquote).filter(Boolean)]); // argument-hint 의 [file] 은 글 그대로
    } else fields.push([key, unquote(val)]);
  }
  const str = (k: string) => { const v = fields.find((f) => f[0] === k)?.[1]; return Array.isArray(v) ? v.join(", ") : (v ?? ""); };
  return { name: str("name").trim() || fallbackName, description: str("description"), fields, body: lines.slice(end + 1).join("\n"), hasFrontmatter: true };
}

/** New skill·Starters 설치가 쓰는 SKILL.md 글(머리말 name·description·argument-hint + 본문) */
export function composeSkill(o: { name: string; description: string; argumentHint?: string; body: string }): string {
  const one = o.description.replace(/\s*\n\s*/g, " ").trim();
  const d = /: |\s#|^["'\[>|&*!%@`-]/.test(one) ? JSON.stringify(one) : one; // 읽을 때 틀어지는 글은 따옴표로
  const hint = o.argumentHint?.trim() ? `argument-hint: ${o.argumentHint.trim()}\n` : "";
  return `---\nname: ${o.name}\ndescription: ${d}\n${hint}---\n\n${o.body.replace(/\s+$/, "")}\n`;
}
