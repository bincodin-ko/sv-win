// 5묶음 E5 S-1927·S-1933: 링크 뽑기·상대 경로 풀기(순수). Reading 과 그래프가 같이 쓴다.
export type Link = { kind: "wiki" | "md"; target: string; heading?: string };

const MD_EXT = /\.(md|markdown|mdx)$/i;
export const isMdPath = (p: string): boolean => MD_EXT.test(p);
export const isExternal = (href: string): boolean => /^[a-z][a-z0-9+.-]+:/i.test(href) || href.startsWith("//");
const fwd = (p: string) => p.replace(/\\/g, "/");
export const dirOf = (p: string): string => fwd(p).replace(/\/[^/]*$/, "");

/** 코드 블록(``` ~~~)과 인라인 코드를 지운 글(링크 찾기용) */
export function stripCode(text: string): string {
  let fence: string | null = null;
  const out: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) { if (m && m[1]![0] === fence[0] && m[1]!.length >= fence.length) fence = null; continue; }
    if (m) { fence = m[1]!; continue; }
    out.push(line.replace(/`[^`]*`/g, ""));
  }
  return out.join("\n");
}

const splitHeading = (s: string): [string, string | undefined] => {
  const i = s.indexOf("#");
  return i < 0 ? [s, undefined] : [s.slice(0, i), s.slice(i + 1) || undefined];
};

/** [[이름]] [[이름|별칭]] [[이름#제목]] 과 [글자](파일.md#제목). 코드 안·http·이미지·md 아닌 링크는 뺀다 */
export function extractLinks(text: string): Link[] {
  const out: Link[] = [];
  const re = /\[\[([^\]\n]+?)\]\]|(!?)\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  for (const m of stripCode(text).matchAll(re)) {
    if (m[1] !== undefined) {
      const [t, heading] = splitHeading(m[1].split("|")[0]!.trim());
      if (t) out.push(heading ? { kind: "wiki", target: t, heading } : { kind: "wiki", target: t });
    } else if (!m[2]) {
      const [t, heading] = splitHeading(m[3]!);
      if (t && !isExternal(t) && isMdPath(t)) out.push(heading ? { kind: "md", target: t, heading } : { kind: "md", target: t });
    }
  }
  return out;
}

/** 글 `from` 안의 상대 링크 href → vault 경로(+제목). 바깥 주소·#제목뿐·md 아닌 것은 null */
export function resolveRel(from: string, href: string): { path: string; heading?: string } | null {
  if (!href || href.startsWith("#") || isExternal(href)) return null;
  const [raw, heading] = splitHeading(href);
  let t = raw;
  try { t = decodeURIComponent(raw); } catch { /* 그대로 */ }
  if (!isMdPath(t)) return null;
  t = fwd(t);
  const seg: string[] = [];
  for (const p of (/^([a-z]:)?\//i.test(t) ? t : `${dirOf(from)}/${t}`).split("/")) {
    if (p === "." || (p === "" && seg.length)) continue;
    if (p === "..") { if (seg.length > 1) seg.pop(); } else seg.push(p);
  }
  const path = seg.join("/");
  return heading ? { path, heading } : { path };
}

/** path 가 root 폴더 안인가(대소문자·역슬래시 무시) */
export function isInside(root: string, path: string): boolean {
  const r = fwd(root).toLowerCase().replace(/\/+$/, "");
  return !!r && fwd(path).toLowerCase().startsWith(r + "/");
}

/** Reading 이 상대 .md 링크를 "누를 수 있는 글"로 만들려고 쓰는 가짜 주소(renderMarkdown 은 http/https/mailto 링크만 만든다) */
export const OPEN_LINK = "https://md-link.invalid/open?p=";
export const MISSING_LINK = "https://md-link.invalid/missing";

/** 글 안의 상대 .md 링크를 가짜 주소로 바꾼다: vault 에 있으면 OPEN_LINK+경로, 없으면 MISSING_LINK. 코드 안은 건드리지 않는다 */
export function rewriteRelLinks(text: string, from: string, exists: (path: string) => boolean): string {
  let fence: string | null = null;
  const LINK = /(!?)(\[[^\]\n]*\])\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  return text.replace(/\r\n?/g, "\n").split("\n").map((line) => {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) { if (m && m[1]![0] === fence[0] && m[1]!.length >= fence.length) fence = null; return line; }
    if (m) { fence = m[1]!; return line; }
    return line.split(/(`[^`]*`)/).map((seg, i) => i % 2 ? seg : seg.replace(LINK, (all, bang: string, label: string, url: string) => {
      if (bang || isExternal(url) || !isMdPath(url.split("#")[0]!)) return all;
      const r = resolveRel(from, url);
      return `${label}(${r && exists(r.path) ? OPEN_LINK + encodeURIComponent(r.path) : MISSING_LINK})`;
    })).join("");
  }).join("\n");
}
