import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../files/markdown";
import { calloutOf } from "./callout";
import { buildPdfHtml, type PdfOpts } from "./html";

// E2 S-1840~S-1848, S-1854: 순수 HTML 빌더 시험. 기대값은 명세 문장에서만 가져온다.
const base: PdfOpts = { title: "Project overview", repo: "symvibe", date: "2026-10-24", md: "Hello", paper: "letter" };
const html = (o: Partial<PdfOpts> = {}) => buildPdfHtml({ ...base, ...o });
const heads = (n: number) => Array.from({ length: n }, (_, i) => `## Head ${i + 1}\n\ntext`).join("\n\n");

describe("표지 (S-1841)", () => {
  it("제목·repo·날짜, 에이전트가 있으면 Written with Claude Code", () => {
    const h = html({ agent: "Claude Code" });
    expect(h).toContain("Project overview");
    expect(h).toContain("symvibe");
    expect(h).toContain("2026-10-24");
    expect(h).toContain("Written with Claude Code");
  });
  it("에이전트 없으면 그 줄이 없다", () => expect(html()).not.toContain("Written with"));
  it("draft 면 Draft — incomplete 줄", () => {
    expect(html({ draft: true })).toContain("Draft — incomplete");
    expect(html()).not.toContain("Draft — incomplete");
  });
  it("표지 뒤 쪽 나눔", () => expect(html()).toMatch(/class="cover"/));
});

describe("목차 (S-1842)", () => {
  it("제목 2개면 없다", () => expect(html({ md: heads(2) })).not.toContain("Contents"));
  it("제목 3개면 Contents 와 안쪽 링크, 쪽 번호 자리표시자 (S-3185)", () => {
    const h = html({ md: heads(3) });
    expect(h).toContain("Contents");
    expect((h.match(/<a href="#h-\d+">Head \d<\/a>/g) ?? []).length).toBe(3);
    expect(h).toMatch(/id="h-0"/);
    for (const k of [0, 1, 2]) expect(h).toContain(`<a href="#h-${k}">Head ${k + 1}</a><span class="pg" data-pg="h-${k}">000</span></li>`);
  });
  it("목차 CSS: flex 줄·점선·쪽 번호 칸·채우기 전 숨김 (S-3185)", () => {
    const h = html({ md: heads(3) });
    expect(h).toMatch(/\.toc li\s*\{[^}]*display:\s*flex/);
    expect(h).toContain("1px dotted #c0c4c8");
    expect(h).toMatch(/\.pg\s*\{[^}]*tabular-nums[^}]*min-width:\s*3ch[^}]*text-align:\s*right/);
    expect(h).toMatch(/\.pg\[data-pg\]\s*\{\s*visibility:\s*hidden/);
  });
  it("목차가 없으면 자리표시자도 없다 (한 번 인쇄)", () => expect(html({ md: heads(2) })).not.toContain("data-pg="));
  it("h4 이하는 세지 않는다", () => expect(html({ md: "#### a\n\n#### b\n\n#### c\n\n##### d" })).not.toContain("Contents"));
});

describe("용지·머리글·쪽번호 (S-1843, S-1844)", () => {
  it("letter: 8.5in 11in, 여백 위아래 0.9in 좌우 1in", () => {
    const h = html();
    expect(h).toMatch(/size:\s*8\.5in 11in/);
    expect(h).toMatch(/margin:\s*0\.9in 1in/);
  });
  it("a4", () => expect(html({ paper: "a4" })).toMatch(/size:\s*A4/i));
  it("@page 가장자리 상자: 머리글 제목 + 쪽번호, 첫 쪽은 없음", () => {
    const h = html({ title: 'He said "hi"' });
    expect(h).toContain("@top-center");
    expect(h).toContain("counter(page)");
    expect(h).toMatch(/@page :first/);
    expect(h).toContain('content: "He said \\"hi\\""');
  });
});

describe("라이트 고정 (S-1840)", () => {
  it("색 하드코딩 줄은 모두 theme-fixed 표시", () => {
    const bad = html().split("\n").filter((l) => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(l) && !l.includes("theme-fixed"));
    expect(bad).toEqual([]);
  });
  it("앱 CSS 변수를 쓰지 않는다", () => expect(html()).not.toContain("var(--"));
});

describe("마크다운 → HTML (S-1846)", () => {
  it("글 안 <script> 는 글자로", () => {
    const h = html({ md: "a <script>alert(1)</script> b\n\n`<b>`" });
    expect(h).not.toContain("<script>");
    expect(h).toContain("&lt;script&gt;");
  });
  it("제목에 든 태그도 글자로", () => expect(html({ title: "<img src=x onerror=1>" })).not.toContain("<img src=x"));
  it("http 링크만 링크, 상대 링크·mailto 는 글자만", () => {
    const h = html({ md: "[a](https://x.io/p) [b](docs/a.md) [c](mailto:z@z.io)" });
    expect(h).toContain('<a href="https://x.io/p">a</a>');
    expect(h).not.toContain('href="docs/a.md"');
    expect(h).not.toContain("mailto:");
  });
  it("굵게·기울임·취소선·인라인 코드·목록·체크 목록·표·인용·가로선", () => {
    const h = html({ md: "**b** *i* ~~s~~ `c`\n\n- x\n- [x] done\n- [ ] todo\n\n1. one\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> q\n\n---" });
    for (const t of ["<strong>b</strong>", "<em>i</em>", "<del>s</del>", "<code>c</code>", "<ul", "<ol", "<table", "<th", "<blockquote", "<hr"]) expect(h).toContain(t);
    expect(h).toContain("☑");
    expect(h).toContain("☐");
  });
  it("코드 블록은 tokenize 결과를 span class 로 강조", () => {
    const h = html({ md: "```ts\nconst x = 1; // hi\n```" });
    expect(h).toMatch(/<span class="tk-keyword">const<\/span>/);
    expect(h).toMatch(/<span class="tk-comment">\/\/ hi<\/span>/);
  });
  it("모르는 언어 코드 블록은 span 없이 글자 그대로", () => {
    const h = html({ md: "```zzz\nconst <x>\n```" });
    expect(h).toContain("const &lt;x&gt;");
    expect(h).not.toContain('class="tk-');
  });
});

describe("이미지 (S-1847)", () => {
  it("baseDir 없음: 상대 이미지는 'Image: <alt>' 자리표시자", () => {
    const h = html({ md: "![diagram](img/a.png)" });
    expect(h).toContain("Image: diagram");
    expect(h).not.toContain("<img");
  });
  it("baseDir 있음: 상대 경로를 file:/// 절대 경로로", () => {
    const h = html({ md: "![d](img/a%20b.png)", baseDir: "C:/repo/docs" });
    expect(h).toContain('src="file:///C:/repo/docs/img/a%20b.png"');
    expect(h).not.toContain("Image:");
  });
  it("http/https 이미지는 그대로(baseDir 와 무관)", () => {
    expect(html({ md: "![x](https://a.io/x.png)" })).toContain('src="https://a.io/x.png"');
    expect(html({ md: "![x](https://a.io/x.png)", baseDir: "C:/r" })).toContain('src="https://a.io/x.png"');
  });
  it("baseDir 밖으로 나가는 ../ 와 file:/ 스킴은 막는다", () => {
    expect(html({ md: "![x](file:///C:/secret.png)", baseDir: "C:/r" })).not.toContain("secret.png\"");
  });
});

describe("콜아웃 (S-1848)", () => {
  const q = (s: string) => (renderMarkdown(s)[0] as { children: ReturnType<typeof renderMarkdown> }).children;
  it("**Note** / **NOTE** / Note: 로 시작하면 NOTE", () => {
    for (const s of ["> **Note** keep this", "> **NOTE** keep this", "> Note: keep this", "> **Note:** keep this"]) {
      const c = calloutOf(q(s));
      expect(c?.label, s).toBe("NOTE");
      expect(JSON.stringify(c?.body)).toContain("keep this");
      expect(JSON.stringify(c?.body)).not.toMatch(/Note/i);
    }
  });
  it("그냥 인용은 null", () => {
    expect(calloutOf(q("> notebook is here"))).toBeNull();
    expect(calloutOf(q("> plain"))).toBeNull();
  });
  it("PDF HTML 에서 콜아웃 상자로", () => {
    const h = html({ md: "> **Note** keep this\n\n> plain" });
    expect(h).toContain('class="callout"');
    expect(h).toContain("NOTE");
    expect(h.match(/class="callout"/g)?.length).toBe(1);
    expect(h).toContain("<blockquote");
  });
});
