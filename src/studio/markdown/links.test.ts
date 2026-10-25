import { describe, expect, it } from "vitest";
import { extractLinks, isExternal, resolveRel } from "./links";

describe("S-1927 상대 링크 해석", () => {
  it("글 폴더 기준으로 ../ ./ 를 풀고 #제목을 떼어 낸다", () => {
    expect(resolveRel("C:/r/docs/a.md", "b.md")).toEqual({ path: "C:/r/docs/b.md" });
    expect(resolveRel("C:/r/docs/a.md", "../x/c.md#top")).toEqual({ path: "C:/r/x/c.md", heading: "top" });
    expect(resolveRel("C:/r/docs/a.md", "./sub/d.markdown")).toEqual({ path: "C:/r/docs/sub/d.markdown" });
  });
  it("http·mailto·#제목뿐·md 아닌 파일은 null", () => {
    expect(resolveRel("C:/r/a.md", "https://x.com/a.md")).toBeNull();
    expect(resolveRel("C:/r/a.md", "mailto:a@b.c")).toBeNull();
    expect(resolveRel("C:/r/a.md", "#sec")).toBeNull();
    expect(resolveRel("C:/r/a.md", "pic.png")).toBeNull();
    expect(isExternal("http://a")).toBe(true);
    expect(isExternal("a.md")).toBe(false);
  });
});

describe("S-1933 링크 뽑기(6형태)", () => {
  it("위키 3형태·마크다운 링크 2형태를 뽑는다", () => {
    const l = extractLinks("[[a]] [[b|별칭]] [[c#h]] [t](a.md) [t](../x/a.md#h)");
    expect(l).toEqual([
      { kind: "wiki", target: "a" },
      { kind: "wiki", target: "b" },
      { kind: "wiki", target: "c", heading: "h" },
      { kind: "md", target: "a.md" },
      { kind: "md", target: "../x/a.md", heading: "h" },
    ]);
  });
  it("코드 블록(``` ~~~)과 인라인 코드 안은 무시, 바깥 http·이미지도 무시", () => {
    const t = "```\n[[no]]\n[x](no.md)\n```\n~~~\n[[no2]]\n~~~\n`[[no3]]` [[yes]] [w](https://a/b.md) ![i](p.md)";
    expect(extractLinks(t)).toEqual([{ kind: "wiki", target: "yes" }]);
  });
});

describe("S-1939 repo 안 판정", () => {
  it("repo 안이면 true, 밖·이름만 비슷하면 false(대소문자·역슬래시 무시)", async () => {
    const { isInside } = await import("./links");
    expect(isInside("C:/fake/repo", "C:/fake/repo/README.md")).toBe(true);
    expect(isInside("C:/fake/repo", "c:\\fake\\repo\\docs\\a.md")).toBe(true);
    expect(isInside("C:/fake/repo", "C:/fake/repo2/a.md")).toBe(false);
    expect(isInside("C:/fake/repo", "C:/other/a.md")).toBe(false);
  });
});

describe("S-1927 rewriteRelLinks", () => {
  it("vault 에 있는 상대 .md 링크는 열기 주소, 없으면 not found 주소, 코드·이미지·http 는 그대로", async () => {
    const { rewriteRelLinks, OPEN_LINK, MISSING_LINK } = await import("./links");
    const ex = (p: string) => p === "C:/r/docs/b.md";
    const code = "`[k](b.md)`\n```\n[z](b.md)\n```";
    const out = rewriteRelLinks(`[a](b.md#x) [c](nope.md) ![i](p.md) [h](https://x.com/a.md) ${code}`, "C:/r/docs/a.md", ex);
    expect(out).toBe(`[a](${OPEN_LINK + encodeURIComponent("C:/r/docs/b.md")}) [c](${MISSING_LINK}) ![i](p.md) [h](https://x.com/a.md) ${code}`);
  });
});
