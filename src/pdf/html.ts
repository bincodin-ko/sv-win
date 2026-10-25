// S-1840~S-1847: 순수 함수 buildPdfHtml — 완결된 라이트 고정 HTML 문자열. md → HTML 은 renderMarkdown 의 MdNode 를 그대로 쓴다.
import { renderMarkdown, type MdNode } from "../files/markdown";
import { langOfFence, tokenize } from "../files/highlight";
import { calloutOf } from "./callout";
import { pdfCss, type Paper } from "./css";

export type { Paper };
export type PdfOpts = { title: string; agent?: string; repo: string; date: string; md: string; baseDir?: string; paper: Paper; draft?: boolean };

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (n: MdNode): string => (n.type === "text" ? n.text : n.children.map(plain).join(""));
type Toc = { id: string; level: number; text: string };

export function buildPdfHtml(o: PdfOpts): string {
  const toc: Toc[] = [];
  const nodes = renderMarkdown(o.md, { baseDir: o.baseDir, allowImage: () => true });
  const R = (ns: MdNode[]): string => ns.map((n) => node(n, o, toc, R)).join("");
  const body = R(nodes);
  const cover =
    `<section class="cover"><div class="t">${esc(o.title)}</div>` +
    (o.agent ? `<p>Written with ${esc(o.agent)}</p>` : "") +
    `<p>${esc(o.repo)}</p><p>${esc(o.date)}</p>` +
    (o.draft ? `<p class="draft">Draft — incomplete</p>` : "") +
    `</section>`;
  const contents =
    toc.length >= 3
      ? `<section class="toc"><div class="t">Contents</div><ol>${toc.map((t) => `<li class="l${t.level}"><a href="#${t.id}">${esc(t.text)}</a><span class="pg" data-pg="${t.id}">000</span></li>`).join("")}</ol></section>`
      : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(o.title)}</title><style>\n${pdfCss(o.paper, o.title)}\n</style></head><body>${cover}${contents}<main>${body}</main></body></html>`;
}

function node(n: MdNode, o: PdfOpts, toc: Toc[], R: (ns: MdNode[]) => string): string {
  if (n.type === "text") return esc(n.text);
  const { tag, attrs = {}, children } = n;
  if (/^h[1-6]$/.test(tag)) {
    if (Number(tag[1]) > 3) return `<${tag}>${R(children)}</${tag}>`;
    const id = `h-${toc.length}`;
    toc.push({ id, level: Number(tag[1]), text: plain(n) });
    return `<${tag} id="${id}">${R(children)}</${tag}>`;
  }
  switch (tag) {
    case "pre": {
      const lines = tokenize(plain(n), langOfFence(String(attrs.lang ?? "")));
      const html = lines.map((l) => l.map((t) => (t.type === "plain" ? esc(t.text) : `<span class="tk-${t.type}">${esc(t.text)}</span>`)).join("")).join("\n");
      return `<pre><code>${html}</code></pre>`;
    }
    case "a": {
      const href = String(attrs.href ?? "");
      return /^https?:\/\//i.test(href) ? `<a href="${esc(href)}">${R(children)}</a>` : R(children); // http 만 링크
    }
    case "img": {
      const src = String(attrs.src ?? ""), alt = String(attrs.alt ?? "");
      if (/^https?:\/\//i.test(src)) return `<img src="${esc(src)}" alt="${esc(alt)}">`;
      if (o.baseDir) return `<img src="file:///${esc(src.replace(/ /g, "%20").replace(/#/g, "%23"))}" alt="${esc(alt)}">`;
      return `<span class="ph">Image: ${esc(alt)}</span>`; // 생성 문서의 이미지는 자리표시자
    }
    case "blockquote": {
      const c = calloutOf(children);
      return c ? `<blockquote class="callout"><div class="label">${c.label}</div>${R(c.body)}</blockquote>` : `<blockquote>${R(children)}</blockquote>`;
    }
    case "li": {
      const box = typeof attrs.checked === "boolean" ? (attrs.checked ? "☑ " : "☐ ") : "";
      return `<li${box ? ' class="task"' : ""}>${box}${R(children)}</li>`;
    }
    case "th":
    case "td": {
      const al = typeof attrs.align === "string" && /^(left|center|right)$/.test(attrs.align) ? ` style="text-align:${attrs.align}"` : "";
      return `<${tag}${al}>${R(children)}</${tag}>`;
    }
    case "hr":
      return "<hr>";
    case "ol":
      return `<ol${typeof attrs.start === "number" ? ` start="${attrs.start}"` : ""}>${R(children)}</ol>`;
  }
  return `<${tag}>${R(children)}</${tag}>`;
}
