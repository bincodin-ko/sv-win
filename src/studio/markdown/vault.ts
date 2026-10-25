import { tm } from "../../i18n";
// 5묶음 E5 S-1921~S-1925: vault 트리·검색·이름 규칙(순수).
export type TreeNode = { name: string; path: string; isDir: boolean; children?: TreeNode[]; virtual?: boolean; empty?: string };
type F = { path: string };

const fwd = (p: string) => p.replace(/\\/g, "/");
const nat = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const rel = (root: string, p: string) => fwd(p).slice(fwd(root).replace(/\/+$/, "").length + 1);

function tree(files: F[], root: string): TreeNode[] {
  const top: TreeNode[] = [];
  const dirs = new Map<string, TreeNode>();
  const base = fwd(root).replace(/\/+$/, "");
  for (const f of files) {
    const parts = rel(root, f.path).split("/");
    let list = top, cur = base;
    for (const seg of parts.slice(0, -1)) {
      cur += "/" + seg;
      let d = dirs.get(cur);
      if (!d) { d = { name: seg, path: cur, isDir: true, children: [] }; dirs.set(cur, d); list.push(d); }
      list = d.children!;
    }
    list.push({ name: parts.at(-1)!, path: f.path, isDir: false });
  }
  const sort = (l: TreeNode[]) => { l.sort((a, b) => Number(b.isDir) - Number(a.isDir) || nat(a.name, b.name)); l.forEach((n) => n.children && sort(n.children)); };
  sort(top);
  return top;
}

/** 폴더 먼저·번호 순서(00 < 2 < 10) 이름순. memory 가 있으면 "Agent memory" 가상 폴더가 맨 위 */
export function buildVaultTree(files: F[], root: string, memory?: { dir: string; files: F[] }): TreeNode[] {
  const t = tree(files, root);
  if (!memory) return t;
  const kids = tree(memory.files, memory.dir);
  const m: TreeNode = { name: tm("Agent memory"), path: memory.dir, isDir: true, virtual: true, children: kids };
  if (!kids.length) m.empty = tm("No notes yet");
  return [m, ...t];
}

/** 이름·경로에 q 가 들어 있는 글(대소문자 무시), 경로순 */
export function searchVault(files: F[], root: string, q: string): { path: string; rel: string }[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return files.map((f) => ({ path: f.path, rel: rel(root, f.path) })).filter((r) => r.rel.toLowerCase().includes(s)).sort((a, b) => nat(a.rel, b.rel));
}

const BAD = /[<>:"/\\|?*\u0000-\u001f]/; // Windows 금지 글자
const okName = (t: string) => !!t && !BAD.test(t) && t !== "." && t !== ".." && !/[. ]$/.test(t);

/** 새 글 이름: 확장자가 md 류가 아니면 .md 를 붙인다. 안 되는 이름은 null */
export function normalizeNoteName(s: string): string | null {
  const t = s.trim();
  if (!okName(t)) return null;
  return /\.(md|markdown|mdx)$/i.test(t) ? t : t + ".md";
}

/** Rename: 쓴 이름 뒤에 원래 확장자를 유지한다. 안 되는 이름은 null */
export function renameTarget(old: string, input: string): string | null {
  const t = input.trim();
  if (!okName(t)) return null;
  const ext = /\.[^./]+$/.exec(old)?.[0] ?? "";
  return !ext || t.toLowerCase().endsWith(ext.toLowerCase()) ? t : t + ext;
}
