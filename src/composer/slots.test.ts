import { describe, expect, it } from "vitest";
import { ROLES } from "../commandbar/roles";
import { cycleAgent, defaultAgentForRole, gridLayout, resizeSlots, rolesDefaults, type Slot } from "./slots";

const ALL = ["claude", "codex", "gemini", "grok", "opencode", "shell"];
const s = (agent: string, touched = false): Slot => ({ agent, touched });

describe("S-526·S-531 gridLayout", () => {
  it.each([[1, 1, 1], [4, 2, 2], [6, 3, 2], [12, 4, 3]])("%i개 → 열 %i 행 %i", (n, cols, rows) => {
    const g = gridLayout(n);
    expect(g.cols).toBe(cols);
    expect(g.rows).toBe(rows);
    expect(g.cells).toHaveLength(n);
  });
  it("칸 간격 24: 오른쪽 칸 x = w+24, 아래 칸 y = h+24, 첫 칸은 0,0", () => {
    const g = gridLayout(4, { w: 720, h: 440 });
    expect(g.cells[0]).toEqual({ x: 0, y: 0 });
    expect(g.cells[1]).toEqual({ x: 744, y: 0 });
    expect(g.cells[2]).toEqual({ x: 0, y: 464 });
    expect(g.cells[3]).toEqual({ x: 744, y: 464 });
  });
});

describe("S-525 역할 → 기본 에이전트", () => {
  it.each([["reviewers", "claude"], ["frontend", "claude"], ["design", "claude"], ["docs", "claude"], ["backend", "codex"], ["security", "codex"], ["testers", "gemini"]] as const)("%s → %s", (role, want) => {
    expect(defaultAgentForRole(role, ALL, "shell")).toBe(want);
  });
  it("General 은 기본 에이전트", () => expect(defaultAgentForRole("general", ALL, "opencode")).toBe("opencode"));
  it("설치 안 됐으면 기본 에이전트", () => {
    expect(defaultAgentForRole("backend", ["claude", "shell"], "claude")).toBe("claude");
    expect(defaultAgentForRole("testers", ["claude"], "shell")).toBe("shell");
  });
  it("모든 역할이 에이전트 하나를 돌려준다", () => {
    for (const r of ROLES) expect(typeof defaultAgentForRole(r, ALL, "claude")).toBe("string");
  });
});

describe("S-523 순환", () => {
  it("다음으로 가고 끝에서 처음으로 돌아간다", () => {
    expect(cycleAgent(ALL, "claude")).toBe("codex");
    expect(cycleAgent(ALL, "shell")).toBe("claude");
    expect(cycleAgent(ALL, "opencode")).toBe("shell");
  });
  it("목록에 없으면 첫 번째", () => expect(cycleAgent(ALL, "zzz")).toBe("claude"));
});

describe("S-525 역할을 바꿔도 손댄 슬롯은 유지", () => {
  it("손대지 않은 슬롯만 새 역할 기본으로", () => {
    const out = rolesDefaults([s("claude"), s("grok", true), s("claude")], "backend", ALL, "claude");
    expect(out.map((x) => x.agent)).toEqual(["codex", "grok", "codex"]);
    expect(out.map((x) => x.touched)).toEqual([false, true, false]);
  });
  it("원본 배열을 바꾸지 않는다", () => {
    const src = [s("claude")];
    rolesDefaults(src, "testers", ALL, "claude");
    expect(src[0]!.agent).toBe("claude");
  });
});

describe("S-522 슬롯 수 늘리고 줄이기", () => {
  it("늘어난 칸은 지금 역할의 기본, 기존 칸은 그대로", () => {
    expect(resizeSlots([s("shell", true)], 3, "backend", ALL, "claude")).toEqual([s("shell", true), s("codex"), s("codex")]);
  });
  it("줄이면 뒤에서 자른다", () => expect(resizeSlots([s("a"), s("b"), s("c")], 2, "general", ALL, "claude").map((x) => x.agent)).toEqual(["a", "b"]));
  it("1~12 로 막는다", () => {
    expect(resizeSlots([s("a")], 20, "general", ALL, "claude")).toHaveLength(12);
    expect(resizeSlots([s("a"), s("b")], 0, "general", ALL, "claude")).toHaveLength(1);
  });
});
