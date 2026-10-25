// S-960: 의존성 없는 Markdown → 안전한 트리. HTML 은 해석하지 않고 글자로 두며(렌더러가 React 텍스트로 그린다),
// 링크는 http/https/mailto 만, 이미지는 allowImage 콜백이 허락한 것만 만든다.
// ponytail: CommonMark 전체가 아니라 S-960 범위만(들여쓰기 코드·setext 제목·참조 링크·강제 줄바꿈 없음). 5묶음 스튜디오가 더 좋은 것을 쓰면 이 파일을 교체한다("교체 지점").
export type MdNode =
  | { type: "text"; text: string }
  | { type: "el"; tag: string; attrs?: Record<string, string | number | boolean>; children: MdNode[] };
export type MdOpts = { baseDir?: string; allowImage?: (url: string) => boolean };

const el = (tag: string, children: MdNode[] = [], attrs?: Record<string, string | number | boolean>): MdNode =>
  attrs ? { type: "el", tag, attrs, children } : { type: "el", tag, children };
const txt = (text: string): MdNode => ({ type: "text", text });
const MAX_DEPTH = 16;

export function renderMarkdown(src: string, opts: MdOpts = {}): MdNode[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/^\t+/, (m) => "    ".repeat(m.length)));
  return blocks(lines, opts, 0);
}

// ---------- 블록 ----------
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEAD = /^ {0,3}(#{1,6})(?:\s+(.*))?$/;
const HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])(?: +(.*)|$)/;
const blank = (l: string) => l.trim() === "";
const indentOf = (l: string) => l.length - l.trimStart().length;

function splitRow(l: string): string[] {
  let s = l.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}
const aligns = (l: string): (string | undefined)[] | null => {
  if (!l.includes("-")) return null;
  const cells = splitRow(l);
  const out: (string | undefined)[] = [];
  for (const c of cells) {
    if (!/^:?-+:?$/.test(c)) return null;
    out.push(c.startsWith(":") ? (c.endsWith(":") ? "center" : "left") : c.endsWith(":") ? "right" : undefined);
  }
  return out;
};
const isTable = (a: string, b: string | undefined) => a.includes("|") && b !== undefined && aligns(b) !== null;
const startsBlock = (l: string, next: string | undefined) =>
  FENCE.test(l) || HEAD.test(l) || HR.test(l) || QUOTE.test(l) || ITEM.test(l) || isTable(l, next);

function blocks(lines: string[], o: MdOpts, depth: number): MdNode[] {
  const out: MdNode[] = [];
  const n = lines.length;
  for (let i = 0; i < n; ) {
    const line = lines[i]!;
    if (blank(line)) { i++; continue; }
    if (depth < MAX_DEPTH) {
      let m = FENCE.exec(line);
      if (m && !(m[1]![0] === "`" && m[2]!.includes("`"))) {
        const ch = m[1]![0]!, len = m[1]!.length, lang = (m[2]!.trim().split(/\s+/)[0] ?? "");
        const body: string[] = [];
        for (i++; i < n; i++) {
          const t = lines[i]!.trim();
          if (t.length >= len && t === ch.repeat(t.length)) { i++; break; }
          body.push(lines[i]!);
        }
        out.push(el("pre", [txt(body.join("\n"))], lang ? { lang } : undefined));
        continue;
      }
      if ((m = HEAD.exec(line))) {
        let t = (m[2] ?? "").trimEnd();
        let k = t.length;
        while (k > 0 && t[k - 1] === "#") k--;
        if (k < t.length && (k === 0 || t[k - 1] === " ")) t = t.slice(0, k).trimEnd();
        out.push(el(`h${m[1]!.length}`, inline(t, o)));
        i++;
        continue;
      }
      if (HR.test(line)) { out.push(el("hr")); i++; continue; }
      if (QUOTE.test(line)) {
        const inner: string[] = [];
        for (; i < n && QUOTE.test(lines[i]!); i++) inner.push(lines[i]!.replace(QUOTE, ""));
        out.push(el("blockquote", blocks(inner, o, depth + 1)));
        continue;
      }
      if (ITEM.test(line)) {
        const r = list(lines, i, o, depth);
        out.push(r[0]);
        i = r[1];
        continue;
      }
      const al = isTable(line, lines[i + 1]) ? aligns(lines[i + 1]!) : null;
      if (al) {
        const head = splitRow(line);
        const cell = (tag: string, c: string, k: number) => el(tag, inline(c, o), al[k] ? { align: al[k]! } : undefined);
        const rows: MdNode[] = [];
        for (i += 2; i < n && !blank(lines[i]!) && lines[i]!.includes("|"); i++)
          rows.push(el("tr", head.map((_, k) => cell("td", splitRow(lines[i]!)[k] ?? "", k))));
        out.push(el("table", [el("thead", [el("tr", head.map((c, k) => cell("th", c, k)))]), el("tbody", rows)]));
        continue;
      }
    }
    const para: string[] = [line];
    for (i++; i < n && !blank(lines[i]!) && (depth >= MAX_DEPTH || !startsBlock(lines[i]!, lines[i + 1])); i++) para.push(lines[i]!);
    out.push(el("p", inline(para.map((l) => l.trim()).join("\n"), o)));
  }
  return out;
}

function list(lines: string[], start: number, o: MdOpts, depth: number): [MdNode, number] {
  const n = lines.length;
  const first = ITEM.exec(lines[start]!)!;
  const base = first[1]!.length;
  const ordered = /\d/.test(first[2]!);
  const items: MdNode[] = [];
  let cur: string[] | null = null;
  const close = () => {
    if (cur) items.push(item(cur, o, depth));
    cur = null;
  };
  let i = start;
  for (; i < n; i++) {
    const line = lines[i]!;
    if (blank(line)) {
      let j = i;
      while (j < n && blank(lines[j]!)) j++;
      if (j >= n || !cur) break;
      const nx = lines[j]!;
      const m = ITEM.exec(nx);
      if (indentOf(nx) >= base + 2 || (m && indentOf(nx) >= base && indentOf(nx) < base + 2 && /\d/.test(m[2]!) === ordered && !HR.test(nx))) {
        (cur as string[]).push("");
        continue;
      }
      break;
    }
    const ind = indentOf(line);
    const m = ITEM.exec(line);
    if (ind >= base + 2 && cur) (cur as string[]).push(line.slice(Math.min(base + 2, ind)));
    else if (m && ind >= base && !HR.test(line)) {
      if (/\d/.test(m[2]!) !== ordered) break;
      close();
      cur = [m[3] ?? ""];
    } else if (ind < base || !cur || startsBlock(line, lines[i + 1]) || blank(lines[i - 1]!)) break;
    else (cur as string[]).push(line.trim()); // 느슨한 이어쓰기
  }
  close();
  const attrs = ordered ? { start: Number(first[2]!.replace(/\D/g, "")) } : undefined;
  return [el(ordered ? "ol" : "ul", items, attrs), i];
}

function item(ls: string[], o: MdOpts, depth: number): MdNode {
  let attrs: Record<string, boolean> | undefined;
  const t = /^\[([ xX])\](?:\s+|$)/.exec(ls[0] ?? "");
  if (t) {
    attrs = { checked: t[1] !== " " };
    ls = [ls[0]!.slice(t[0].length), ...ls.slice(1)];
  }
  const kids = blocks(ls, o, depth + 1);
  const f = kids[0];
  const flat = f && f.type === "el" && f.tag === "p" ? [...f.children, ...kids.slice(1)] : kids; // 촘촘한 목록은 문단 껍질을 벗긴다
  return el("li", flat, attrs);
}

// ---------- 인라인 ----------
const SAFE_LINK = /^(?:https?:|mailto:)/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function resolveImage(url: string, o: MdOpts): string | null {
  if (!o.allowImage) return null;
  let u = url.trim();
  if (/^https?:\/\//i.test(u)) return o.allowImage(u) ? u : null;
  if (SCHEME.test(u) || u.startsWith("//") || /^[\\/]/.test(u) || /^[a-z]:/i.test(u)) return null;
  const seg: string[] = [];
  for (const p of `${o.baseDir ?? ""}/${u.replace(/\\/g, "/")}`.split("/")) {
    if (p === "" || p === ".") continue;
    if (p === "..") { if (!seg.length) return null; seg.pop(); } else seg.push(p);
  }
  u = seg.join("/");
  return u && o.allowImage(u) ? u : null;
}

function inline(s: string, o: MdOpts, depth = 0): MdNode[] {
  const out: MdNode[] = [];
  let buf = "";
  const flush = () => { if (buf) { out.push(txt(buf)); buf = ""; } };
  const push = (nd: MdNode) => { flush(); out.push(nd); };
  const lastClose = s.lastIndexOf("]");
  const noCloser = new Map<string, number>(); // 이 자리 뒤에 닫는 표시가 없다는 기억(느려짐 방지)
  const n = s.length;
  const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

  for (let i = 0; i < n; ) {
    const c = s[i]!;
    if (c === "\\" && i + 1 < n && /[\\`*_{}[\]()#+\-.!|~<>]/.test(s[i + 1]!)) { buf += s[i + 1]; i += 2; continue; }
    if (c === "`") {
      let r = i;
      while (s[r] === "`") r++;
      const run = s.slice(i, r);
      let j = s.indexOf(run, r);
      while (j >= 0 && s[j + run.length] === "`") { let e = j; while (s[e] === "`") e++; j = s.indexOf(run, e); }
      if (j < 0) { buf += run; i = r; continue; }
      let code = s.slice(r, j);
      if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ")) code = code.slice(1, -1);
      push(el("code", [txt(code)]));
      i = j + run.length;
      continue;
    }
    if ((c === "[" || (c === "!" && s[i + 1] === "[")) && depth < 8) {
      const img = c === "!";
      const b = i + (img ? 1 : 0);
      let end = -1;
      if (b < lastClose) {
        for (let k = b + 1, d = 1; k < n; k++) {
          if (s[k] === "\\") k++;
          else if (s[k] === "[") d++;
          else if (s[k] === "]" && --d === 0) { end = k; break; }
        }
      }
      if (end > 0 && s[end + 1] === "(") {
        let close = -1;
        for (let k = end + 2, d = 1; k < n; k++) {
          if (s[k] === "(") d++;
          else if (s[k] === ")" && --d === 0) { close = k; break; }
        }
        if (close > 0) {
          const label = s.slice(b + 1, end);
          const url = s.slice(end + 2, close).trim().split(/\s+/)[0] ?? "";
          const raw = s.slice(i, close + 1);
          if (img) {
            const src = resolveImage(url, o);
            if (src) push(el("img", [], { src, alt: label }));
            else buf += label || raw;
          } else if (SAFE_LINK.test(url)) push(el("a", inline(label, o, depth + 1), { href: url }));
          else buf += raw;
          i = close + 1;
          continue;
        }
      }
    }
    if (c === "<") {
      const m = /<([^\s<>]+)>/y;
      m.lastIndex = i;
      const r = m.exec(s);
      if (r && /^(?:https?:\/\/|mailto:)/i.test(r[1]!)) { push(el("a", [txt(r[1]!)], { href: r[1]! })); i += r[0].length; continue; }
    }
    if (c === "*" || c === "_" || c === "~") {
      const dbl = s[i + 1] === c;
      if (c === "~" && !dbl) { buf += c; i++; continue; }
      const d = dbl ? c + c : c;
      let r = i;
      while (s[r] === c) r++;
      const open = i + d.length;
      const opens = r - i >= d.length && !/\s/.test(s[open] ?? " ") && !(c === "_" && isWord(s[i - 1]));
      let j = -1;
      if (opens && !((noCloser.get(d) ?? Infinity) <= open)) {
        for (let f = s.indexOf(d, open); f >= 0; f = s.indexOf(d, f + 1)) {
          if (!dbl && c !== "~" && (s[f + 1] === c || s[f - 1] === c)) { while (s[f + 1] === c) f++; continue; }
          if (f > open && !/\s/.test(s[f - 1]!) && !(c === "_" && isWord(s[f + d.length]))) { j = f; break; }
        }
        if (j < 0) noCloser.set(d, Math.min(noCloser.get(d) ?? Infinity, open));
      }
      if (j >= 0) {
        push(el(c === "~" ? "del" : dbl ? "strong" : "em", inline(s.slice(open, j), o, depth + 1)));
        i = j + d.length;
      } else { buf += s.slice(i, r); i = r; } // 짝 없는 표시는 글자
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}
