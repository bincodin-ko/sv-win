import { describe, expect, it } from "vitest";
import { INTENT_TABLE, OPEN_WHAT } from "./table";

// S-2913
const TS = ["spawn", "makeGroup", "addToGroup", "pause", "resume", "restart", "close", "tell", "broadcast", "camera", "open", "tidy", "undo", "redo", "theme", "workspace", "git", "add", "openWeb", "tool", "status", "whoFinished", "help", "closePanel", "loop"];

describe("S-2913 INTENT_TABLE", () => {
  it("t 이름 25개가 정확히 표에 있다", () => {
    expect(Object.keys(INTENT_TABLE).sort()).toEqual([...TS].sort());
  });
  it("v1에서 뺀 것은 표에 없다", () => {
    for (const t of ["connect", "addOrchestrator", "handoff", "forward", "cancel", "orderUnrouted", "later", "unavailable", "needsPlanner", "smallTalk", "notFound", "ambiguous"]) expect(t in INTENT_TABLE).toBe(false);
  });
  it("위험 등급: tell·broadcast·git만 confirm", () => {
    const c = Object.entries(INTENT_TABLE).filter(([, e]) => e.risk === "confirm").map(([t]) => t).sort();
    expect(c).toEqual(["broadcast", "git", "tell"]);
  });
  it("open.what 값이 Intent의 값과 같다", () => {
    expect([...OPEN_WHAT].sort()).toEqual(["code", "conversations", "documents", "loops", "markdown", "memory", "mission", "presets", "settings", "skills", "usage"]);
  });
  it("필드 정의 예: spawn은 n·agent·role·name, tidy는 없음", () => {
    expect(Object.keys(INTENT_TABLE.spawn!.fields).sort()).toEqual(["agent", "n", "name", "role"]);
    expect(Object.keys(INTENT_TABLE.tidy!.fields)).toEqual([]);
  });
});
