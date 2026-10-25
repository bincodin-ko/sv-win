// S-959·S-960·S-961·S-964: Markdown 카드. 디스크 파일을 읽어 그린다(1초 폴링). 트리를 React 요소로만 그린다(HTML 문자열 삽입 없음).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useScope } from "../board/BoardScope";
import { fileRead, openUrl } from "../lib/ipc";
import { exportPdf } from "../pdf/exportPdf";
import { useShell } from "../shell/useShell";
import { isInside } from "../studio/markdown/links";
import { requestOpenStudio } from "../studio/useStudio";
import { btnStyle, cardStyle, headStyle, Toks, titleStyle } from "./CodeView";
import { langOfFence, tokenize } from "./highlight";
import { renderMarkdown, type MdNode } from "./markdown";
import { useFileWatch } from "./useFileWatch";
import { useT } from "../i18n";

export const MD_CSS = `
.md-body{padding:10px 14px;line-height:1.55;color:var(--fg);font:13px/1.55 system-ui;overflow-wrap:anywhere}
.md-body h1,.md-body h2,.md-body h3,.md-body h4,.md-body h5,.md-body h6{margin:.9em 0 .4em;color:var(--fg);line-height:1.25}
.md-body h1{font-size:1.6em;border-bottom:1px solid var(--bd);padding-bottom:.2em}.md-body h2{font-size:1.35em}.md-body h3{font-size:1.15em}
.md-body p,.md-body ul,.md-body ol,.md-body blockquote,.md-body pre,.md-body table{margin:.5em 0}
.md-body code{font:12px ui-monospace,Consolas,monospace;background:var(--well);padding:1px 4px;border-radius:4px}
.md-body pre{background:var(--well);border-radius:6px;padding:8px 10px;overflow:auto}.md-body pre code{background:none;padding:0;white-space:pre}
.md-body blockquote{border-left:3px solid var(--bd-2);padding-left:10px;color:var(--mute-2)}
.md-body hr{border:0;border-top:1px solid var(--bd)}
.md-body a{color:var(--accent-text);cursor:pointer}
.md-body table{border-collapse:collapse}.md-body th,.md-body td{border:1px solid var(--bd-2);padding:3px 8px}.md-body th{background:var(--surface-2)}
.md-body li.task{list-style:none;margin-left:-1.2em}.md-body li.task input{margin-right:6px}
.md-body img{max-width:100%}
`;
const TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "strong", "em", "del", "code", "pre", "ul", "ol", "li", "blockquote", "hr", "a", "table", "thead", "tbody", "tr", "th", "td"]);
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp" };

/** 상대 경로 이미지는 파일에서 읽어 blob 으로 보인다(http/https 는 그대로) */
function Img({ src, alt, dir }: { src: string; alt: string; dir: string }) {
  const remote = /^https?:\/\//i.test(src);
  const [url, setUrl] = useState<string | null>(remote ? src : null);
  useEffect(() => {
    if (remote) return;
    let dead = false;
    let made: string | null = null;
    fileRead(`${dir}/${src}`).then((b) => {
      if (dead) return;
      made = URL.createObjectURL(new Blob([b as BlobPart], { type: MIME[src.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream" }));
      setUrl(made);
    }, () => {});
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [src, dir, remote]);
  return url ? <img src={url} alt={alt} /> : <span>{alt}</span>;
}

/** 링크를 다르게 그리고 싶은 쪽(Markdown 스튜디오 Reading)이 넘긴다. undefined 를 돌려주면 기본(브라우저로 열기) */
export type LinkRender = (href: string, kids: ReactNode[], key: number) => ReactNode | undefined;
export function view(ns: MdNode[], dir: string, lr?: LinkRender): ReactNode[] {
  return ns.map((n, i) => {
    if (n.type === "text") return n.text;
    const { tag, attrs = {}, children } = n;
    if (tag === "img") return <Img key={i} src={String(attrs.src)} alt={String(attrs.alt ?? "")} dir={dir} />;
    if (tag === "hr") return <hr key={i} />;
    if (!TAGS.has(tag)) return <span key={i}>{view(children, dir, lr)}</span>; // 모르는 태그는 요소로 만들지 않는다
    if (tag === "pre") {
      const body = children.map((c) => (c.type === "text" ? c.text : "")).join("");
      const lang = langOfFence(String(attrs.lang ?? ""));
      return <pre key={i}><code>{tokenize(body, lang).map((toks, j, all) => <span key={j}><Toks toks={toks} />{j < all.length - 1 ? "\n" : ""}</span>)}</code></pre>;
    }
    if (tag === "a") {
      const href = String(attrs.href);
      const custom = lr?.(href, view(children, dir, lr), i);
      if (custom !== undefined) return custom;
      return <a key={i} href={href} onClick={(e) => { e.preventDefault(); openUrl(href).catch(() => {}); }}>{view(children, dir, lr)}</a>;
    }
    if (tag === "li" && attrs.checked !== undefined)
      return <li key={i} className="task"><input type="checkbox" checked={attrs.checked === true} disabled readOnly />{view(children, dir, lr)}</li>;
    const props: Record<string, unknown> = { key: i };
    if (tag === "ol" && attrs.start !== undefined) props.start = Number(attrs.start);
    if ((tag === "td" || tag === "th") && attrs.align) props.style = { textAlign: String(attrs.align) };
    const Tag = tag as "p";
    return <Tag {...props}>{view(children, dir, lr)}</Tag>;
  });
}

const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, "");

export default function MarkdownCard({ id }: { id: string }) {
  const t = useT();
  const { store: useBoard } = useScope();
  const node = useBoard((s) => s.nodes[id]);
  const path = (node?.path as string | undefined) ?? "";
  const res = useFileWatch(path);
  const text = res?.kind === "text" ? res.text : null;
  const [pdfErr, setPdfErr] = useState("");
  useEffect(() => { if (!pdfErr) return; const t = setTimeout(() => setPdfErr(""), 5000); return () => clearTimeout(t); }, [pdfErr]);
  const dir = dirOf(path);
  const repo = useShell((s) => s.activeRepo);
  const tree = useMemo(() => (text === null ? null : renderMarkdown(text, { allowImage: () => true })), [text]);
  if (!node) return null;
  const name = (node.name as string | undefined) ?? path.split(/[\/]/).pop() ?? "";
  return (
    <div data-testid="md-card" style={cardStyle}>
      <style>{MD_CSS}</style>
      <div data-node-handle style={headStyle}>
        <span data-testid="md-title" title={path} style={titleStyle}>{(node.name as string | undefined) ?? path}</span>
        {repo && isInside(repo, path) && <button data-testid="md-open-studio" style={btnStyle} disabled={res?.kind === "deleted"} onClick={() => void requestOpenStudio("markdown", path)}>{t("Open in Studio")}</button>}
        <button data-testid="md-pdf" style={btnStyle} disabled={text === null} onClick={() => void exportPdf({ title: /^#\s+(.+)$/m.exec(text ?? "")?.[1]?.trim() || name.replace(/\.[^.]*$/, ""), repo: (repo ?? "").split(/[\/]/).filter(Boolean).pop() ?? "", date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), md: text ?? "", baseDir: dir }).catch((e) => setPdfErr(String(e)))}>{t("PDF")}</button>
      </div>
      {pdfErr && <div data-testid="md-pdf-error" role="status" style={{ padding: "4px 12px", color: "var(--danger)", fontSize: 12 }}>{pdfErr}</div>}
      <div data-wheel-own style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {tree ? <div data-testid="md-body" className="md-body">{view(tree, dir)}</div>
          : res?.kind === "deleted" ? <div data-testid="md-deleted" style={{ padding: 14, color: "var(--mute-2)" }}><b>{t("File deleted")}</b><div style={{ marginTop: 4, overflowWrap: "anywhere" }}>{path}</div></div>
          : res ? <div style={{ padding: 14, color: "var(--mute-2)" }}>{t("Can't show this file")}</div>
          : <div style={{ padding: 14, color: "var(--mute-3)" }}>{t("Loading…")}</div>}
      </div>
    </div>
  );
}
