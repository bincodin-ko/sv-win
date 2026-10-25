import { describe, expect, it } from "vitest";
import { inspectWindow, planInspect, type NodeLike } from "./inspect";

// S-1130: 타일마다 하나 / S-1131: 창 이름 inspect-<타일 id>
const tile = (extra: Partial<NodeLike> = {}): NodeLike => ({ id: "web-1", kind: "web", tabs: [{ id: "a", url: "http://x" }, { id: "b", url: "http://y" }], active: "b", ...extra });
describe("인스펙터 카드 규칙", () => {
  it("창 이름은 inspect-<타일 id>", () => {
    expect(inspectWindow("web-7")).toBe("inspect-web-7");
  });
  it("카드가 없으면 새 카드 사양: 타일에 잇고 지금 열린 탭을 붙인다", () => {
    expect(planInspect({ "web-1": tile() }, "web-1")).toEqual({ create: { wireTo: "web-1", tab: "b" } });
  });
  it("이미 이 타일의 카드가 있으면 그 id", () => {
    const nodes = { "web-1": tile(), "inspector-1": { id: "inspector-1", kind: "inspector", wireTo: "web-1" } };
    expect(planInspect(nodes, "web-1")).toEqual({ existing: "inspector-1" });
  });
  it("다른 타일의 카드는 세지 않는다", () => {
    const nodes = { "web-1": tile(), "web-2": tile({ id: "web-2" }), "inspector-1": { id: "inspector-1", kind: "inspector", wireTo: "web-2" } };
    expect(planInspect(nodes, "web-1")).toEqual({ create: { wireTo: "web-1", tab: "b" } });
  });
});
