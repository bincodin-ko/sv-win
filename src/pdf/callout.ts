// S-1848: 인용 블록이 **Note** / **NOTE** / Note: 로 시작하면 NOTE 콜아웃. 앱 미리보기와 PDF 가 같은 규칙을 쓴다.
import type { MdNode } from "../files/markdown";
export type Callout = { label: "NOTE"; body: MdNode[] };

const text = (n: MdNode | undefined): string | null => (n && n.type === "text" ? n.text : null);

export function calloutOf(children: MdNode[]): Callout | null {
  const p = children[0];
  if (!p || p.type !== "el" || p.tag !== "p") return null;
  const [first, ...rest] = p.children;
  let kids: MdNode[] | null = null;
  if (first?.type === "el" && first.tag === "strong" && first.children.length === 1 && /^note:?$/i.test(text(first.children[0]) ?? "")) kids = rest;
  else if (/^note:/i.test(text(first) ?? "")) kids = [{ type: "text", text: text(first)!.slice(5) }, ...rest];
  if (!kids) return null;
  // 표식 바로 뒤의 ":" 와 공백을 지운다
  const t = text(kids[0]);
  if (t !== null) kids = [{ type: "text" as const, text: t.replace(/^:?\s*/, "") }, ...kids.slice(1)].filter((n, i) => i > 0 || text(n) !== "");
  const body: MdNode[] = [...(kids.length ? [{ ...p, children: kids }] : []), ...children.slice(1)];
  return { label: "NOTE", body };
}
