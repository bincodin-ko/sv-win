import { describe, expect, it } from "vitest";
import type { BoardNode } from "../board/store";
import type { Intent } from "../commandbar/intent";
import { sessionKey } from "../console/sessionKey";
import { guard, MAIN_BAR_ONLY, MAIN_BAR_ONLY_4, NOT_CONNECTED, scopeOf, type OrchScope } from "./scope";

const con = (id: string, g?: string): BoardNode => ({ id, kind: "console", x: 0, y: 0, w: 720, h: 440, z: 1, name: id, agentId: "codex", ...(g ? { groupId: g } : {}) });
const k = (id: string) => sessionKey("ws", id);
const S: OrchScope = { consoles: [k("c1"), k("c2")], groups: [sessionKey("ws", "g1")] };

describe("scopeOf", () => {
  it("wired 의 콘솔과 그룹 멤버를 sessionKey 로 (그룹 id 는 groups 에)", () => {
    const nodes = Object.fromEntries([con("c1"), con("c2", "g1"), con("c3", "g1"), con("c4")].map((n) => [n.id, n]));
    const card: BoardNode = { id: "o", kind: "orchestrator", x: 0, y: 0, w: 1, h: 1, z: 1, wired: ["c1", "g1"] };
    const s = scopeOf("ws", nodes, [{ id: "g1", name: "G", role: "general" }], card);
    expect([...s.consoles].sort()).toEqual([k("c1"), k("c2"), k("c3")].sort());
    expect(s.groups).toEqual([sessionKey("ws", "g1")]);
  });
});

describe("S-1260 범위 밖 멘션", () => {
  it("지휘 밖 콘솔을 부른 지시는 막고 답", () => {
    const i: Intent = { t: "tell", targets: [{ kind: "console", id: k("c9") }], text: "x" };
    expect(guard(i, S)).toBe(NOT_CONNECTED);
    expect(NOT_CONNECTED).toBe("That mention is not connected to this orchestrator");
  });
  it("지휘 안 콘솔·그룹은 통과", () => {
    expect(guard({ t: "tell", targets: [{ kind: "console", id: k("c1") }, { kind: "group", id: sessionKey("ws", "g1") }], text: "x" }, S)).toBeNull();
  });
  it("대상 지정 pause/restart/camera 도 같은 검사", () => {
    expect(guard({ t: "pause", target: { kind: "console", id: k("c9") } }, S)).toBe(NOT_CONNECTED);
    expect(guard({ t: "restart", target: { kind: "group", id: sessionKey("ws", "g2") } }, S)).toBe(NOT_CONNECTED);
    expect(guard({ t: "camera", op: "goto", target: { kind: "console", id: k("c9") } }, S)).toBe(NOT_CONNECTED);
  });
  it("대상 없는 말(all·orderUnrouted·broadcast·status)은 통과 — 실행기가 지휘 콘솔 안에서만 고른다", () => {
    for (const i of [{ t: "pause", target: { kind: "all" } }, { t: "orderUnrouted", text: "x" }, { t: "broadcast", text: "x" }, { t: "status" }] as Intent[]) expect(guard(i, S)).toBeNull();
  });
});

describe("S-1261 메인 바 전용", () => {
  it("undo·redo·workspace·theme 는 실행하지 않고 답", () => {
    for (const i of [{ t: "undo" }, { t: "redo" }, { t: "workspace", op: "new" }, { t: "workspace", op: "go", ref: "w" }, { t: "theme", value: "light" }] as Intent[]) expect(guard(i, S)).toBe(MAIN_BAR_ONLY);
    expect(MAIN_BAR_ONLY).toBe("Undo, redo and workspace commands work from the main command bar.");
  });
});

describe("S-1739 카드에서 4묶음 명령", () => {
  it("open 패널·add an orchestrator·connect·every … 는 메인 바에서만", () => {
    for (const i of [{ t: "open", what: "loops" }, { t: "open", what: "usage" }, { t: "addOrchestrator" }, { t: "connect", target: { kind: "all" } }, { t: "loop", minutes: 10, text: "x" }] as Intent[]) expect(guard(i, S)).toBe(MAIN_BAR_ONLY_4);
    expect(MAIN_BAR_ONLY_4).toBe("That works from the main command bar.");
    expect(guard({ t: "open", what: "settings" }, S)).toBeNull();
  });
});
