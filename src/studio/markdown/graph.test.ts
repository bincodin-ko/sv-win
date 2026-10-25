import { describe, expect, it } from "vitest";
import { buildGraph, layoutGraph, layoutIterations } from "./graph";

const f = (path: string, text = "") => ({ path, text });
const pairs = (g: ReturnType<typeof buildGraph>) => g.edges.map((e) => `${e.a}|${e.b}`).sort();

describe("S-1933 buildGraph", () => {
  it("링크 6형태가 선이 되고 못 찾은 링크·코드 블록 안은 무시, 같은 쌍은 한 선", () => {
    const g = buildGraph([
      f("C:/r/a.md", "[[b]] [[c|별칭]] [[d#h]] [t](e.md) [t](../x/g.md#h) [[nope]] [[b]]\n```\n[[h]]\n```"),
      f("C:/r/b.md", "[[a]]"),
      f("C:/r/c.md"), f("C:/r/d.md"), f("C:/r/e.md"), f("C:/r/h.md"),
      f("C:/x/g.md"),
    ]);
    expect(pairs(g)).toEqual(["C:/r/a.md|C:/r/b.md", "C:/r/a.md|C:/r/c.md", "C:/r/a.md|C:/r/d.md", "C:/r/a.md|C:/r/e.md", "C:/r/a.md|C:/x/g.md"]);
  });
  it("링크 없는 글도 점이고 연결 수(degree)가 붙는다", () => {
    const g = buildGraph([f("C:/r/a.md", "[[b]]"), f("C:/r/b.md"), f("C:/r/lonely.md")]);
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["C:/r/a.md", "C:/r/b.md", "C:/r/lonely.md"]);
    expect(Object.fromEntries(g.nodes.map((n) => [n.name, n.degree]))).toEqual({ a: 1, b: 1, lonely: 0 });
  });
  it("위키 이름은 대소문자 무시, 동명 두 파일이면 경로가 짧은 것", () => {
    const g = buildGraph([f("C:/r/a.md", "[[NOTE]]"), f("C:/r/deep/er/note.md"), f("C:/r/x/note.md")]);
    expect(pairs(g)).toEqual(["C:/r/a.md|C:/r/x/note.md"]);
  });
  it("자기 자신으로의 링크는 선이 아니다", () => {
    expect(buildGraph([f("C:/r/a.md", "[[a]]")]).edges).toEqual([]);
  });
});

type P = Record<string, { x: number; y: number }>;
const ring = (n: number) => buildGraph(Array.from({ length: n }, (_, i) => f(`C:/r/n${i}.md`, `[[n${(i + 1) % n}]]`)));
const dist = (p: P, a: string, b: string) => Math.hypot(p[a]!.x - p[b]!.x, p[a]!.y - p[b]!.y);
const each = (p: P, fn: (d: number) => void) => {
  const ids = Object.keys(p);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) fn(dist(p, ids[i]!, ids[j]!));
};
const minDist = (p: P) => { let m = Infinity; each(p, (d) => (m = Math.min(m, d))); return m; };
const meanDist = (p: P) => { let s = 0, c = 0; each(p, (d) => ((s += d), c++)); return s / c; };

describe("S-1934 layoutGraph", () => {
  it("같은 입력이면 같은 자리(결정적)", () => {
    expect(layoutGraph(ring(12), 1, 0)).toEqual(layoutGraph(ring(12), 1, 0));
  });
  it("점이 겹치지 않는다(가장 가까운 두 점 >= 점 최대 지름 18)", () => {
    expect(minDist(layoutGraph(ring(30), 1, 0))).toBeGreaterThanOrEqual(18);
    expect(minDist(layoutGraph(ring(30), 0.5, 0))).toBeGreaterThanOrEqual(18);
  });
  it("간격 슬라이더가 클수록 퍼진다", () => {
    expect(meanDist(layoutGraph(ring(20), 2, 0))).toBeGreaterThan(meanDist(layoutGraph(ring(20), 0.5, 0)));
  });
  it("반복 수: 600개 이하 300, 600개 넘으면 120", () => {
    expect(layoutIterations(600)).toBe(300);
    expect(layoutIterations(601)).toBe(120);
  });
  it("무링크 글만 있어도 모든 점이 자리를 받는다", () => {
    const g = buildGraph([f("C:/r/a.md"), f("C:/r/b.md"), f("C:/r/c.md")]);
    expect(Object.keys(layoutGraph(g, 1, 0)).length).toBe(3);
  });
});
