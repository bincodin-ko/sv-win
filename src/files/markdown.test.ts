import { describe, expect, it } from "vitest";
import { renderMarkdown, type MdNode } from "./markdown";

// S-960: Markdown 렌더 범위(순수 부분). 결과 트리는 XSS 안전해야 한다.
type El = Extract<MdNode, { type: "el" }>;
const find = (n: MdNode[], tag: string): El[] =>
  n.flatMap((x) => (x.type === "el" ? [...(x.tag === tag ? [x] : []), ...find(x.children, tag)] : []));
const text = (n: MdNode[]): string => n.map((x) => (x.type === "text" ? x.text : text(x.children))).join("");
const R = (s: string, o = {}) => renderMarkdown(s, { allowImage: () => true, ...o });

describe("블록", () => {
  it("제목 1~6, 7개는 문단", () => {
    for (let i = 1; i <= 6; i++) expect(text(find(R(`${"#".repeat(i)} T${i}`), `h${i}`)), `h${i}`).toBe(`T${i}`);
    expect(find(R("####### x"), "h6")).toHaveLength(0);
    expect(find(R("####### x"), "p")).toHaveLength(1);
  });
  it("문단은 빈 줄로 나뉘고 같은 문단 줄바꿈은 이어진다", () => {
    expect(find(R("a\nb\n\nc"), "p")).toHaveLength(2);
  });
  it("굵게·기울임·취소선·인라인 코드", () => {
    const t = R("**b** *i* _j_ ~~d~~ `c*x*`");
    expect(text(find(t, "strong"))).toBe("b");
    expect(find(t, "em").map((e) => text([e]))).toEqual(["i", "j"]);
    expect(text(find(t, "del"))).toBe("d");
    expect(text(find(t, "code"))).toBe("c*x*");
    expect(find(find(t, "code"), "em")).toHaveLength(0);
  });
  it("코드 블록은 언어를 attrs.lang 으로 넘기고 내용은 그대로", () => {
    const pre = find(R("```ts\nconst a = 1;\n  <b>\n```"), "pre");
    expect(pre).toHaveLength(1);
    expect(pre[0].attrs?.lang).toBe("ts");
    expect(text(pre)).toBe("const a = 1;\n  <b>");
    expect(find(R("```\nx\n```"), "pre")[0].attrs?.lang ?? "").toBe("");
  });
  it("닫히지 않은 코드 블록은 끝까지 코드", () => {
    expect(text(find(R("```py\nx = 1"), "pre"))).toBe("x = 1");
  });
  it("비순서·순서 목록, 시작 번호", () => {
    const u = find(R("- a\n- b\n* c"), "li");
    expect(u.map((l) => text([l]))).toEqual(["a", "b", "c"]);
    const o = find(R("3. x\n4. y"), "ol");
    expect(o).toHaveLength(1);
    expect(o[0].attrs?.start).toBe(3);
    expect(find(o, "li")).toHaveLength(2);
  });
  it("중첩 목록(들여쓰기)", () => {
    const t = R("- a\n  - b\n    - c\n- d");
    const top = find(t, "ul")[0];
    expect(top.children.filter((c) => c.type === "el" && c.tag === "li")).toHaveLength(2);
    expect(find(top.children, "ul")).toHaveLength(2); // b 목록 안에 c 목록까지
    expect(text(find(find(t, "li")[0].children, "li")[0].children)).toContain("b");
  });
  it("체크 목록은 li.attrs.checked 로", () => {
    const li = find(R("- [ ] a\n- [x] b\n- [X] c"), "li");
    expect(li.map((l) => l.attrs?.checked)).toEqual([false, true, true]);
    expect(text([li[1]])).toBe("b");
  });
  it("인용(중첩 포함)", () => {
    expect(find(R("> a\n> > b"), "blockquote")).toHaveLength(2);
  });
  it("가로선", () => {
    for (const s of ["---", "***", "___", "- - -"]) expect(find(R(`a\n\n${s}\n\nb`), "hr"), s).toHaveLength(1);
  });
  it("표: 머리·본문·정렬", () => {
    const t = R("| a | b |\n|:--|--:|\n| 1 | 2 |\n| 3 | 4 |");
    expect(find(t, "th").map((c) => text([c]))).toEqual(["a", "b"]);
    expect(find(t, "td").map((c) => text([c]))).toEqual(["1", "2", "3", "4"]);
    expect(find(t, "th")[0].attrs?.align).toBe("left");
    expect(find(t, "th")[1].attrs?.align).toBe("right");
    expect(find(t, "tr")).toHaveLength(3);
  });
});

describe("링크·이미지", () => {
  it("http/https/mailto 링크는 a[href]", () => {
    for (const u of ["http://a.b/c", "https://a.b", "mailto:x@y.z"]) {
      const a = find(R(`[t](${u})`), "a");
      expect(a, u).toHaveLength(1);
      expect(a[0].attrs?.href).toBe(u);
      expect(text(a)).toBe("t");
    }
  });
  it("javascript: 등 다른 스킴은 링크가 아니라 글자", () => {
    for (const u of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x", "file:///c:/x"]) {
      const t = R(`[t](${u})`);
      expect(find(t, "a"), u).toHaveLength(0);
      expect(text(t), u).toContain("t");
    }
  });
  it("자동 링크 <https://..> 는 http(s) 만", () => {
    expect(find(R("<https://a.b>"), "a")).toHaveLength(1);
    expect(find(R("<javascript:alert(1)>"), "a")).toHaveLength(0);
  });
  it("이미지는 allowImage 콜백이 true 일 때만 img, 아니면 대체 글자", () => {
    const seen: string[] = [];
    const t = renderMarkdown("![alt](https://a.b/x.png)", { allowImage: (u) => (seen.push(u), true) });
    expect(find(t, "img")[0].attrs).toMatchObject({ src: "https://a.b/x.png", alt: "alt" });
    expect(seen).toEqual(["https://a.b/x.png"]);
    const no = renderMarkdown("![alt](https://a.b/x.png)", { allowImage: () => false });
    expect(find(no, "img")).toHaveLength(0);
    expect(text(no)).toContain("alt");
  });
  it("이미지 콜백이 없으면 이미지는 막는다", () => {
    expect(find(renderMarkdown("![a](https://a.b/x.png)"), "img")).toHaveLength(0);
  });
  it("상대 경로 이미지는 baseDir 와 합쳐 콜백에 넘긴다(.. 로 못 벗어남)", () => {
    const seen: string[] = [];
    const t = renderMarkdown("![a](img/p.png) ![b](../../etc/x.png)", { baseDir: "docs", allowImage: (u) => (seen.push(u), true) });
    expect(seen[0]).toBe("docs/img/p.png");
    expect(find(t, "img").map((i) => i.attrs?.src)).toContain("docs/img/p.png");
    expect(find(t, "img").some((i) => String(i.attrs?.src).includes(".."))).toBe(false);
  });
  it("이미지 javascript:/data: 는 콜백까지 가지 않고 거절", () => {
    let called = 0;
    const t = renderMarkdown("![a](javascript:x) ![b](data:image/png;base64,AAA)", { allowImage: () => (called++, true) });
    expect(called).toBe(0);
    expect(find(t, "img")).toHaveLength(0);
  });
});

describe("안전·경계", () => {
  it("HTML 태그는 글자로(태그 노드가 생기지 않음)", () => {
    const t = R("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\ntext <b>x</b>");
    for (const tag of ["script", "img", "b", "iframe"]) expect(find(t, tag), tag).toHaveLength(0);
    expect(text(t)).toContain("<script>alert(1)</script>");
    expect(text(t)).toContain("<img src=x onerror=alert(1)>");
  });
  it("모든 el 의 tag 는 허용 목록 안", () => {
    const ok = new Set("h1 h2 h3 h4 h5 h6 p strong em del code pre ul ol li blockquote hr a table thead tbody tr th td img br".split(" "));
    const walk = (n: MdNode[]): string[] => n.flatMap((x) => (x.type === "el" ? [x.tag, ...walk(x.children)] : []));
    const t = R("# <i>h</i>\n\n- <u>a</u> **<s>b</s>**\n\n| <x> |\n|--|\n| <y> |\n\n> <z>\n\n```<q>\n<w>\n```");
    expect(walk(t).filter((x) => !ok.has(x))).toEqual([]);
    expect(walk(t).length).toBeGreaterThan(5);
  });
  it("링크 속성은 href 하나뿐(따옴표가 있어도 속성이 늘지 않음)", () => {
    const a = find(R('[t](https://a.b/"onmouseover="x)'), "a");
    for (const x of a) expect(Object.keys(x.attrs ?? {})).toEqual(["href"]);
  });
  it("빈 입력·공백뿐이면 빈 트리", () => {
    expect(R("")).toEqual([]);
    expect(R("  \n\n \n")).toEqual([]);
  });
  it("아주 긴 줄도 빨리 끝난다(역추적 폭주 없음)", () => {
    const t0 = performance.now();
    R("*".repeat(50000) + "\n\n" + "[".repeat(20000) + "\n\n" + "a ".repeat(100000) + "\n\n" + "_a".repeat(20000));
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
