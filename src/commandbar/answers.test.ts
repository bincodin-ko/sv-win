import { describe, expect, it } from "vitest";
import { HELP_TEXT, LATER_TEXT, NEEDS_PLANNER_TEXT, smallTalkText, statusText, whoFinishedText } from "./answers";
import type { Order } from "./report";

const r = (name: string, status: string, needsYou = false) => ({ name, status, needsYou });
const ord = (name: string, verdict: Order["verdict"], sentAt = 0): Order => ({ id: 1, repo: "r", name, nodeId: "c", wsId: "w", sentAt, sawWorking: true, verdict });

describe("S-612 status", () => {
  it("콘솔 수를 상태별로 세고 도움이 필요한 콘솔 이름을 말한다", () => {
    expect(statusText([r("Otto", "RUNNING", true), r("Dax", "WORKING"), r("Bex", "WORKING"), r("Cy", "RUNNING"), r("Di", "IDLE")]))
      .toBe("5 consoles: 2 working, 1 needs you (Otto), 2 ready");
  });
  it("하나뿐이면 단수, 없으면 안내", () => {
    expect(statusText([r("Otto", "PAUSED")])).toBe("1 console: 1 paused");
    expect(statusText([])).toBe("No consoles yet.");
  });
});

describe("S-613 who finished", () => {
  it("가장 최근 주문 기준으로 끝남·실패·진행 중·도움 필요를 나열한다", () => {
    const t = whoFinishedText(
      [ord("Otto", { state: "finished", secs: 130 }), ord("Dax", { state: "working" }, 0), ord("Bex", { state: "failed", secs: 4, reason: "the agent exited" }), ord("Cy", { state: "expired" })],
      ["Eli"], 65_000);
    expect(t.split("\n")).toEqual([
      "Otto finished · 2m 10s", "Dax is still working · 1m 5s", "Bex failed: the agent exited", "Cy didn't answer in 30 minutes", "Eli needs you",
    ]);
  });
  it("아무것도 없으면 안내", () => {
    expect(whoFinishedText([], [], 0)).toBe("No orders yet.");
  });
});

describe("S-614·S-617 고정 문구", () => {
  it("help 는 이 묶음에서 되는 명령만 보여 준다", () => {
    for (const w of ["spawn", "pause", "status", "zoom", "workspace", "undo", "tidy up"]) expect(HELP_TEXT.toLowerCase()).toContain(w);
    expect(HELP_TEXT.toLowerCase()).not.toContain("github");
    for (const w of ["open documents", "open code", "open markdown", "open skills"]) expect(HELP_TEXT.toLowerCase()).toContain(w); // S-1809
    for (const w of ["orchestrator", "every 10 minutes", "open memory", "pass this task to codex"]) expect(HELP_TEXT.toLowerCase()).toContain(w); // S-1731
  });
  it("S-2985 help 마지막 줄은 planner 안내", () => {
    expect(HELP_TEXT.split("\n").at(-1)).toBe("• anything else — the planner reads it (Settings > Planner)");
    expect(HELP_TEXT.split("\n")).toHaveLength(18);
  });
  it("later·unavailable·needsPlanner·smallTalk", () => {
    expect(LATER_TEXT).toBe("That isn't available in this version yet.");
    expect(NEEDS_PLANNER_TEXT).toBe("I couldn't read that without the planner. Start with who it is for, like @Otto run the tests");
    expect(smallTalkText().length).toBeGreaterThan(0);
    expect(smallTalkText().length).toBeLessThan(60);
  });
});
