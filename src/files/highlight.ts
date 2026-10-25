// S-965: 의존성 없는 구문 강조 토큰기. 언어별 정규식 하나로 줄을 훑고, 여러 줄 주석·문자열은 줄 상태로 잇는다.
// ponytail: 정규식 근사라 중첩 템플릿 ${}·정규식 리터럴·heredoc 은 모른다. 5묶음 스튜디오가 더 좋은 토큰기를 쓰면 이 파일(tokenize)만 교체한다.
export type TokType = "comment" | "string" | "number" | "keyword" | "plain";
export type Tok = { type: TokType; text: string };

const EXT: Record<string, string> = {
  ts: "ts", mts: "ts", cts: "ts", tsx: "tsx", js: "js", mjs: "js", cjs: "js", jsx: "jsx", json: "json", jsonc: "json",
  rs: "rs", py: "py", go: "go", java: "java", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "cs", css: "css",
  html: "html", htm: "html", sh: "sh", bash: "sh", ps1: "ps1", sql: "sql", yaml: "yaml", yml: "yaml", toml: "toml",
  md: "md", markdown: "md",
  swift: "swift", rb: "rb", kt: "kt", kts: "kt", m: "objc", mm: "objc", php: "php", scss: "scss", xml: "xml", svg: "xml",
};

/** 파일 경로(\ 또는 /) → 언어 이름. 모르면 "plain". */
export function langOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? (EXT[base.slice(dot + 1).toLowerCase()] ?? "plain") : "plain";
}

const FENCE: Record<string, string> = {
  typescript: "ts", javascript: "js", python: "py", rust: "rs", shell: "sh", zsh: "sh", powershell: "ps1", pwsh: "ps1",
  csharp: "cs", "c#": "cs", golang: "go", "c++": "cpp", yml: "yaml",
};

/** Markdown 펜스 언어 이름(typescript, c++ …) → 언어. 별칭표 → 확장자표 순. 모르면 "plain". */
export function langOfFence(name: string): string {
  const n = name.trim().toLowerCase();
  return FENCE[n] ?? EXT[n] ?? "plain";
}

type Cfg = { re: RegExp; kw: Set<string>; ci: boolean; close: Record<string, string>; ml: string[] };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
const words = (s: string) => new Set(s.split(" "));
const JS = "break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while with yield async await as from interface type implements private public protected readonly abstract declare namespace keyof";
const KW: Record<string, string> = {
  js: JS, ts: JS, jsx: JS, tsx: JS, json: "true false null", yaml: "true false null", toml: "true false",
  rs: "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while",
  py: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield",
  go: "break case chan const continue default defer else fallthrough false for func go goto if import interface map nil package range return select struct switch true type var",
  java: "abstract boolean break byte case catch char class const continue default do double else enum extends false final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch this throw throws true try void volatile while",
  c: "auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while NULL true false",
  cpp: "auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern false float for friend if inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while",
  cs: "abstract async await base bool break case catch char class const continue default delegate do double else enum event false finally float for foreach if in int interface internal is lock long namespace new null object out override private protected public readonly ref return sealed short static string struct switch this throw true try using var virtual void while",
  sh: "if then else elif fi for while until do done case esac in function select return exit local export readonly true false",
  ps1: "begin break catch class continue data do dynamicparam else elseif end exit filter finally for foreach from function if in param process return switch throw trap try until using var while $true $false $null",
  sql: "select from where and or not insert into values update set delete create table alter drop index view join left right inner outer full on as group by order having limit offset distinct union all null is in like between exists case when then else end primary key foreign references default unique check begin commit rollback",
  css: "important",
  swift: "as associatedtype break case catch class continue default defer do else enum extension false fallthrough fileprivate for func guard if import in init inout internal is let nil open operator private protocol public repeat return self Self static struct subscript super switch throw throws true try typealias var where while",
  rb: "alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield",
  kt: "as break class continue do else false for fun if in interface is null object package return super this throw true try typealias val var when while by catch constructor finally import init override private protected public internal open abstract data sealed companion",
  objc: "@interface @implementation @end @property @protocol @class @selector @synthesize @dynamic self super nil NULL YES NO id void int long float double char BOOL if else for while do switch case default return break continue static const typedef struct enum",
  php: "abstract and array as break case catch class clone const continue declare default do echo else elseif empty extends false final finally fn for foreach function global if implements include interface isset list namespace new null or print private protected public require return static switch this throw trait true try use var while yield",
  scss: "@mixin @include @extend @import @use @function @return @if @else @each @for @while important",
};
const HASH = ["#"];
// [줄 주석, 블록 주석(열기, 닫기), 따옴표(한 줄), 여러 줄 따옴표]
const SPEC: Record<string, { line?: string[]; block?: [string, string][]; q: string[]; ml?: string[]; tri?: boolean; chr?: boolean }> = {
  js: { line: ["//"], block: [["/*", "*/"]], q: ['"', "'"], ml: ["`"] },
  json: { q: ['"'] },
  rs: { line: ["//"], block: [["/*", "*/"]], q: ['"'], chr: true },
  py: { line: HASH, q: ['"', "'"], tri: true },
  go: { line: ["//"], block: [["/*", "*/"]], q: ['"', "'"], ml: ["`"] },
  java: { line: ["//"], block: [["/*", "*/"]], q: ['"', "'"] },
  css: { block: [["/*", "*/"]], q: ['"', "'"] },
  html: { block: [["<!--", "-->"]], q: ['"'] },
  sh: { line: HASH, q: ['"', "'"] },
  ps1: { line: HASH, block: [["<#", "#>"]], q: ['"', "'"] },
  sql: { line: ["--"], block: [["/*", "*/"]], q: ["'", '"'] },
  yaml: { line: HASH, q: ['"', "'"] },
  toml: { line: HASH, q: ['"', "'"] },
  rb: { line: HASH, q: ['"', "'"] },
  php: { line: ["//", "#"], block: [["/*", "*/"]], q: ['"', "'"] },
  scss: { line: ["//"], block: [["/*", "*/"]], q: ['"', "'"] },
};
SPEC.xml = SPEC.html!;
for (const l of ["ts", "jsx", "tsx"]) SPEC[l] = SPEC.js!;
for (const l of ["c", "cpp", "cs", "swift", "kt", "objc"]) SPEC[l] = SPEC.java!;

const cache = new Map<string, Cfg | null>();
function cfgOf(lang: string): Cfg | null {
  if (cache.has(lang)) return cache.get(lang)!;
  const s = SPEC[lang];
  let cfg: Cfg | null = null;
  if (s) {
    const close: Record<string, string> = {};
    const part = (name: string, alts: string[]) => (alts.length ? [`(?<${name}>${alts.join("|")})`] : []);
    for (const [o, c] of s.block ?? []) close[o] = c;
    const triQ = s.tri ? ['"""', "'''"] : [];
    const src = [
      ...part("b", (s.block ?? []).map(([o]) => esc(o))),
      ...part("l", (s.line ?? []).map((p) => (p === "#" ? "(?<!\\S)#" : esc(p)))),
      ...part("c", s.chr ? ["'(?:\\\\.[^']*|[^'\\\\])'"] : []),
      ...part("s", [...triQ, ...(s.ml ?? []), ...s.q].map(esc)),
      "(?<n>\\d[\\w.]*)",
      ...(lang === "html" || lang === "xml" ? ["(?<t></?[A-Za-z][\\w:-]*)"] : []),
      "(?<w>[A-Za-z_$][\\w$]*)",
    ].join("|");
    cfg = { re: new RegExp(src, "g"), kw: words(KW[lang] ?? ""), ci: lang === "sql", close, ml: s.ml ?? [] };
  }
  cache.set(lang, cfg);
  return cfg;
}

/** S-1815: 이 글자 수를 넘는 파일은 강조하지 않는다 */
export const HIGHLIGHT_MAX = 120_000;

type St = { close: string; type: TokType; esc: boolean } | null;

/** 줄마다 토큰 배열. 줄 수 = 개행 수 + 1(\r\n 도 한 줄). 모르는 언어는 줄마다 plain 한 덩어리. */
export function tokenize(text: string, lang: string): Tok[][] {
  const lines = text.split(/\r?\n/);
  const cfg = text.length > HIGHLIGHT_MAX ? null : cfgOf(lang); // S-1815: 큰 파일은 강조를 끈다
  if (!cfg) return lines.map((l) => (l ? [{ type: "plain", text: l }] : []));
  let st: St = null;
  return lines.map((line) => {
    const out: Tok[] = [];
    let start = 0; // 아직 내보내지 않은 plain 시작
    const emit = (type: TokType, from: number, to: number) => {
      if (from > start) out.push({ type: "plain", text: line.slice(start, from) });
      if (to > from) out.push({ type, text: line.slice(from, to) });
      start = to;
    };
    // 이어지는 여러 줄 주석·문자열
    let pos = 0;
    if (st) {
      const end = endOf(line, 0, st.close, st.esc);
      if (end < 0) { emit(st.type, 0, line.length); return out; }
      emit(st.type, 0, end);
      pos = end;
      st = null;
    }
    const re = cfg.re;
    re.lastIndex = pos;
    for (let m: RegExpExecArray | null; (m = re.exec(line)); ) {
      const g = m.groups as Record<string, string | undefined>;
      const from = m.index;
      let to = from + m[0].length;
      if (g.w !== undefined) {
        if (cfg.kw.has(cfg.ci ? g.w.toLowerCase() : g.w)) emit("keyword", from, to);
      } else if (g.n !== undefined) emit("number", from, to);
      else if (g.t !== undefined) emit("keyword", from, to);
      else if (g.c !== undefined) emit("string", from, to);
      else if (g.l !== undefined) { emit("comment", from, line.length); break; }
      else if (g.b !== undefined) {
        const close = cfg.close[g.b] ?? "";
        const end = endOf(line, to, close, false);
        if (end < 0) { st = { close, type: "comment", esc: false }; to = line.length; } else to = end;
        emit("comment", from, to);
      } else {
        const q = g.s ?? "";
        const multi = cfg.ml.includes(q) || q.length === 3;
        const end = endOf(line, to, q, true);
        if (end < 0) {
          if (multi) st = { close: q, type: "string", esc: true };
          to = line.length; // 한 줄 문자열은 줄 끝에서 끝난다
        } else to = end;
        emit("string", from, to);
      }
      re.lastIndex = to;
    }
    if (start < line.length) out.push({ type: "plain", text: line.slice(start) });
    return out;
  });
}

/** from 부터 close 가 끝나는 위치(뒤). 없으면 -1. esc 면 \ 다음 글자는 건너뛴다. */
function endOf(line: string, from: number, close: string, esc: boolean): number {
  if (!esc) {
    const i = line.indexOf(close, from);
    return i < 0 ? -1 : i + close.length;
  }
  for (let j = from; j < line.length; j++) {
    if (line[j] === "\\") j++;
    else if (line.startsWith(close, j)) return j + close.length;
  }
  return -1;
}
