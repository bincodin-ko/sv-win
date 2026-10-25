import { describe, expect, it } from "vitest";
import "../board/kinds";
import { getStore } from "../board/boards";
import { addNode } from "./addCmd";

// S-1064·S-1065
const mkStore = () => getStore(`add-${Math.random()}`);
const nodes = (s: ReturnType<typeof mkStore>) => Object.values(s.getState().nodes);

describe("addNode", () => {
  it("note + 글 -> 스티커에 글이 들어가고 선택된다", () => {
    const s = mkStore();
    const id = addNode(s, "note", "ship the beta on Friday");
    const n = s.getState().nodes[id]!;
    expect(n.kind).toBe("sticky");
    expect((n as unknown as { text: string }).text).toBe("ship the beta on Friday");
    expect(s.getState().selection).toEqual([id]);
  });
  it("글이 없으면 빈 스티커", () => {
    const s = mkStore();
    const id = addNode(s, "note");
    expect((s.getState().nodes[id] as unknown as { text: string }).text).toBe("");
  });
  it.each([["kanban", "kanban"], ["calendar", "calendar"], ["checklist", "checklist"], ["browser", "web"]] as const)("%s -> %s 노드", (what, kind) => {
    const s = mkStore();
    const id = addNode(s, what);
    expect(s.getState().nodes[id]!.kind).toBe(kind);
  });
  it("browser + 주소 -> 그 주소의 탭 하나", () => {
    const s = mkStore();
    const id = addNode(s, "browser", "http://localhost:3000");
    const n = s.getState().nodes[id] as unknown as { tabs: { url: string }[] };
    expect(n.tabs.map((t) => t.url)).toEqual(["http://localhost:3000"]);
  });
  it("browser 만 -> 빈 시작 탭", () => {
    const s = mkStore();
    const id = addNode(s, "browser");
    expect((s.getState().nodes[id] as unknown as { tabs: { url: string }[] }).tabs[0]!.url).toBe("");
  });
  it("두 번 놓으면 서로 겹치지 않는다", () => {
    const s = mkStore();
    addNode(s, "note", "a"); addNode(s, "note", "b");
    const [a, b] = nodes(s);
    const hit = a!.x < b!.x + b!.w && b!.x < a!.x + a!.w && a!.y < b!.y + b!.h && b!.y < a!.y + a!.h;
    expect(hit).toBe(false);
  });
});
