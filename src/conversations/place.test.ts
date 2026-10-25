import { describe, expect, it } from "vitest";
import { markResumeFirst, takeResumeFirst } from "../console/offers";
import { findPlaced, targetWs } from "./place";

// H3 S-2840·S-2843·§0. 순수 부분: findPlaced · targetWs · 한 번용 표
const con = (id: string, agentId: string, resume?: object) => ({ id, kind: "console", agentId, resume });
const stores = new Map([
  ["wsA", { nodes: { c1: con("c1", "claude", { claudeSessionId: "u1" }), n1: { id: "n1", kind: "note" } } }],
  ["wsB", { nodes: { c7: con("c7", "codex", { codexSessionId: "u2" }), c8: con("c8", "claude", { codexSessionId: "u1" }) } }],
]);
const claude = (sessionId: string) => ({ cli: "claude" as const, sessionId });
const codex = (sessionId: string) => ({ cli: "codex" as const, sessionId });

describe("findPlaced", () => {
  it("같은 cli·같은 대화 id 콘솔의 보드와 노드", () => {
    expect(findPlaced(stores as never, claude("u1"))).toEqual({ wsId: "wsA", nodeId: "c1" });
    expect(findPlaced(stores as never, codex("u2"))).toEqual({ wsId: "wsB", nodeId: "c7" });
  });
  it("cli 가 다르면(같은 id 라도) 다른 대화, 없는 id 는 null", () => {
    expect(findPlaced(stores as never, codex("u1"))).toBeNull();
    expect(findPlaced(stores as never, claude("nope"))).toBeNull();
    expect(findPlaced(new Map(), claude("u1"))).toBeNull();
  });
});

describe("targetWs", () => {
  const repos = [{ path: "C:/a", activeWs: "wsA" }, { path: "hub:h1", activeWs: "h1" }, { path: "C:/z", activeWs: null }];
  it("보이는 보드", () => expect(targetWs({ view: "board", activeRepo: "hub:h1", openRepos: repos })).toBe("h1"));
  it("홈이면 마지막으로 보던 repo 의 activeWs", () => expect(targetWs({ view: "home", activeRepo: "C:/a", openRepos: repos })).toBe("wsA"));
  it("열린 보드가 없으면 null", () => {
    expect(targetWs({ view: "home", activeRepo: null, openRepos: [] })).toBeNull();
    expect(targetWs({ view: "home", activeRepo: "C:/z", openRepos: repos })).toBeNull();
  });
});

describe("한 번용 표 (S-2841·S-2845)", () => {
  it("mark 한 키는 한 번만 꺼내진다", () => {
    markResumeFirst('["w","c1"]', "u9");
    expect(takeResumeFirst('["w","c2"]')).toBeUndefined();
    expect(takeResumeFirst('["w","c1"]')).toBe("u9");
    expect(takeResumeFirst('["w","c1"]')).toBeUndefined();
  });
});
