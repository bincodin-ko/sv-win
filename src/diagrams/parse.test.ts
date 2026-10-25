import { describe, expect, it } from "vitest";
import { parseDiagram } from "./parse";

const ok = '{"title":"T","nodes":[{"id":"a","label":"A","shape":"box"},{"id":"b","label":"B","shape":"pill","group":"ui"}],"edges":[{"from":"a","to":"b","label":"calls"}]}';

describe("S-2029 parseDiagram", () => {
  it("정상 JSON", () => {
    const d = parseDiagram(ok)!;
    expect(d.title).toBe("T");
    expect(d.nodes.map((n) => [n.id, n.shape, n.group])).toEqual([["a", "box", undefined], ["b", "pill", "ui"]]);
    expect(d.edges).toEqual([{ from: "a", to: "b", label: "calls" }]);
  });
  it("1 코드 울타리와 앞뒤 설명글을 벗긴다", () => {
    const d = parseDiagram("Sure! Here you go:\n```json\n" + ok + "\n```\nHope it helps {not json}");
    expect(d?.nodes).toHaveLength(2);
  });
  it("2 잘린 배열: 닫힌 노드·엣지 객체만 건진다", () => {
    const cut = '{"title":"T","nodes":[{"id":"a","label":"A"},{"id":"b","label":"B"},{"id":"c","lab';
    expect(parseDiagram(cut)!.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    const cut2 = '{"title":"T","nodes":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"edges":[{"from":"a","to":"b"},{"from":"b","to"';
    expect(parseDiagram(cut2)!.edges).toEqual([{ from: "a", to: "b" }]);
  });
  it("3 중복 id 는 번호를 붙인다(엣지는 첫 노드)", () => {
    const d = parseDiagram('{"nodes":[{"id":"a","label":"A1"},{"id":"a","label":"A2"},{"id":"a","label":"A3"}],"edges":[{"from":"a","to":"a"}]}')!;
    expect(d.nodes.map((n) => n.id)).toEqual(["a", "a-2", "a-3"]);
    expect(new Set(d.nodes.map((n) => n.id)).size).toBe(3);
  });
  it("4 없는 id 를 가리키는 엣지는 버린다", () => {
    const d = parseDiagram('{"nodes":[{"id":"a","label":"A"}],"edges":[{"from":"a","to":"zzz"},{"from":"q","to":"a"}]}')!;
    expect(d.edges).toEqual([]);
  });
  it("5 라벨 40자·노트 60자로 자르고 모르는 shape 는 box", () => {
    const d = parseDiagram(JSON.stringify({ nodes: [{ id: "a", label: "x".repeat(50), note: "n".repeat(80), shape: "hexagon" }] }))!;
    expect(d.nodes[0].label).toHaveLength(40);
    expect(d.nodes[0].note).toHaveLength(60);
    expect(d.nodes[0].shape).toBe("box");
  });
  it("6 노드는 최대 20개(넘는 노드를 가리키는 엣지도 버림)", () => {
    const nodes = Array.from({ length: 25 }, (_, i) => ({ id: `n${i}`, label: `N${i}` }));
    const d = parseDiagram(JSON.stringify({ nodes, edges: [{ from: "n0", to: "n19" }, { from: "n0", to: "n20" }] }))!;
    expect(d.nodes).toHaveLength(20);
    expect(d.edges).toEqual([{ from: "n0", to: "n19" }]);
  });
  it("노드 0개·글 아님 → null", () => {
    expect(parseDiagram('{"title":"T","nodes":[],"edges":[]}')).toBeNull();
    expect(parseDiagram("I could not do that.")).toBeNull();
    expect(parseDiagram("")).toBeNull();
  });
  it("제목이 없으면 기본 제목", () => {
    expect(parseDiagram('{"nodes":[{"id":"a","label":"A"}]}')!.title).toBe("Diagram");
  });
  it("문자열 안의 중괄호·따옴표에 속지 않는다", () => {
    const d = parseDiagram('{"nodes":[{"id":"a","label":"a } \\" {","note":"]"},{"id":"b","label":"B"}]}')!;
    expect(d.nodes.map((n) => n.id)).toEqual(["a", "b"]);
  });
});
