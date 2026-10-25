import { describe, expect, it } from "vitest";
import { ACTION_LABEL, keyFor, rebind } from "./keymap";

// S-364·S-365 기대값은 명세 문장에서만: 겹치면 어느 키와 겹치는지, Esc = 예전 키 유지, Delete = 기본값 복원, 고정 키·X 거절
describe("S-364 기본 키", () => {
  it("기본은 V = Select, T = Spawn agent", () => {
    expect(keyFor({}, "select")).toBe("v");
    expect(keyFor(undefined, "spawn")).toBe("t");
  });
});

describe("S-365 새 키 조건", () => {
  it("글자·숫자·기호 한 글자는 받고 소문자로 저장한다", () => {
    const r = rebind({}, "spawn", "B");
    expect(r).toEqual({ ok: true, map: { spawn: "b" } });
    expect(keyFor((r as { map: Record<string, string> }).map, "spawn")).toBe("b");
    expect(rebind({}, "select", "7")).toEqual({ ok: true, map: { select: "7" } });
    expect(rebind({}, "select", "/")).toEqual({ ok: true, map: { select: "/" } });
  });
  it("다른 단축키와 겹치면 받지 않고 어느 키와 겹치는지 알려 준다", () => {
    expect(rebind({}, "spawn", "v")).toEqual({ ok: false, reason: { kind: "conflict", with: "Select" } });
    expect(rebind({ spawn: "b" }, "select", "b")).toEqual({ ok: false, reason: { kind: "conflict", with: "Spawn agent" } });
  });
  it("뒤 묶음이 쓸 기본 키(G·M·S·L·D·P·E·N)와도 겹치면 받지 않는다", () => {
    for (const k of ["g", "m", "s", "l", "d", "p", "e", "n"]) expect(rebind({}, "spawn", k).ok).toBe(false);
  });
  it("X 는 바꿀 수도, 다른 동작에 쓸 수도 없다", () => {
    expect(rebind({}, "spawn", "x")).toEqual({ ok: false, reason: { kind: "reserved", with: "X" } });
    expect(rebind({}, "spawn", "X").ok).toBe(false);
  });
  it("고정 키(Space·화살표·Ctrl 조합·Shift+1)는 받지 않는다", () => {
    for (const k of [" ", "ArrowLeft", "ArrowUp", "Ctrl+b", "Alt+b", "Shift+1", "Tab", "Enter", "!"]) {
      expect(rebind({}, "spawn", k)).toEqual({ ok: false, reason: { kind: "fixed" } });
    }
  });
  it("자기 자신의 키를 다시 누르면 그대로 받는다", () => {
    expect(rebind({}, "spawn", "t")).toEqual({ ok: true, map: {} });
    expect(rebind({ spawn: "b" }, "spawn", "b")).toEqual({ ok: true, map: { spawn: "b" } });
  });
  it("Esc 는 예전 키를 유지하고 Delete 는 기본값을 되돌린다", () => {
    expect(rebind({ spawn: "b" }, "spawn", "Escape")).toEqual({ ok: true, map: { spawn: "b" } });
    expect(rebind({ spawn: "b" }, "spawn", "Delete")).toEqual({ ok: true, map: {} });
  });
  it("원래 맵을 바꾸지 않는다", () => {
    const m = { spawn: "b" };
    rebind(m, "select", "9");
    expect(m).toEqual({ spawn: "b" });
  });
  it("T 를 바꾼 뒤 옛 T 는 다른 동작이 쓸 수 있다", () => {
    expect(rebind({ spawn: "b" }, "select", "t")).toEqual({ ok: true, map: { spawn: "b", select: "t" } });
  });
});

// B16 S-364·S-690: N = Jump to the console that needs you
describe("B16 N 키", () => {
  it("기본 N 이고 Shortcuts 창 줄 이름이 있다", () => {
    expect(keyFor({}, "needsYou")).toBe("n");
    expect(ACTION_LABEL.needsYou).toBe("Jump to the console that needs you");
  });
  it("N 을 다른 동작에 주면 거절하고 어느 키와 겹치는지 알려 준다", () => {
    expect(rebind({}, "spawn", "n")).toEqual({ ok: false, reason: { kind: "conflict", with: "Jump to the console that needs you" } });
  });
  it("N 줄도 바꿀 수 있다", () => {
    expect(rebind({}, "needsYou", "j")).toEqual({ ok: true, map: { needsYou: "j" } });
  });
});

// C1 S-805: P = Pen, E = Eraser, G = Git 패널. 예약(LATER)에서 g·p·e 를 빼고 줄로 올린다(m·s·l·d 는 그대로)
describe("C1 S-805 Pen·Eraser·Git 키", () => {
  it("기본 키와 Shortcuts 줄 이름", () => {
    expect(keyFor({}, "pen")).toBe("p");
    expect(keyFor({}, "eraser")).toBe("e");
    expect(keyFor(undefined, "git")).toBe("g");
    expect([ACTION_LABEL.pen, ACTION_LABEL.eraser, ACTION_LABEL.git]).toEqual(["Pen", "Eraser", "Git panel"]);
  });
  it("다른 동작에 P·E·G 를 주면 Pen·Eraser·Git panel 과 겹친다고 거절", () => {
    expect(rebind({}, "spawn", "p")).toEqual({ ok: false, reason: { kind: "conflict", with: "Pen" } });
    expect(rebind({}, "spawn", "e")).toEqual({ ok: false, reason: { kind: "conflict", with: "Eraser" } });
    expect(rebind({}, "select", "g")).toEqual({ ok: false, reason: { kind: "conflict", with: "Git panel" } });
  });
  it("s·d 는 5묶음 E1 이 Skills·Markdown 줄로 올렸다 — 거절은 그대로, 이유가 충돌(Skills/Markdown)", () => {
    expect(rebind({}, "spawn", "s")).toEqual({ ok: false, reason: { kind: "conflict", with: "Skills" } });
    expect(rebind({}, "spawn", "d")).toEqual({ ok: false, reason: { kind: "conflict", with: "Markdown" } });
  });
  it("S-1806 Skills=s·Markdown=d 가 기본이고 바꿀 수 있다", () => {
    expect(keyFor(undefined, "skills")).toBe("s");
    expect(keyFor(undefined, "markdown")).toBe("d");
    expect(rebind({}, "skills", "k")).toEqual({ ok: true, map: { skills: "k" } });
    expect(rebind({}, "skills", "d")).toEqual({ ok: false, reason: { kind: "conflict", with: "Markdown" } });
    expect(rebind({ skills: "k" }, "spawn", "s").ok).toBe(true); // 비운 s 는 다른 동작이 쓸 수 있다
  });
  it("Pen 줄은 바꿀 수 있고(X 는 못 씀), 바꾸면 옛 P 는 다른 동작이 쓸 수 있다", () => {
    expect(rebind({}, "pen", "b")).toEqual({ ok: true, map: { pen: "b" } });
    expect(rebind({}, "pen", "x")).toEqual({ ok: false, reason: { kind: "reserved", with: "X" } });
    expect(rebind({}, "pen", "t")).toEqual({ ok: false, reason: { kind: "conflict", with: "Spawn agent" } });
    expect(rebind({ pen: "b" }, "spawn", "p")).toEqual({ ok: true, map: { pen: "b", spawn: "p" } });
  });
  it("자기 키를 다시 누르면 그대로, Delete 는 기본값 복원", () => {
    expect(rebind({}, "git", "g")).toEqual({ ok: true, map: {} });
    expect(rebind({ eraser: "b" }, "eraser", "Delete")).toEqual({ ok: true, map: {} });
  });
});

// D1 S-1228: M = Memory 패널, L = Loops 패널 (X = Mission Map 은 못 바꿈). 예약(LATER)에서 m·l 을 줄로 올린다
describe("D1 S-1228 Memory·Loops 키", () => {
  it("기본 키와 Shortcuts 줄 이름", () => {
    expect(keyFor({}, "memory")).toBe("m");
    expect(keyFor(undefined, "loops")).toBe("l");
    expect([ACTION_LABEL.memory, ACTION_LABEL.loops]).toEqual(["Memory", "Loops"]);
  });
  it("다른 동작에 M·L 을 주면 Memory·Loops 와 겹친다고 거절", () => {
    expect(rebind({}, "spawn", "m")).toEqual({ ok: false, reason: { kind: "conflict", with: "Memory" } });
    expect(rebind({}, "select", "l")).toEqual({ ok: false, reason: { kind: "conflict", with: "Loops" } });
  });
  it("Memory 줄은 바꿀 수 있고 X 는 못 쓰며, 바꾸면 옛 M 은 다른 동작이 쓸 수 있다", () => {
    expect(rebind({}, "memory", "b")).toEqual({ ok: true, map: { memory: "b" } });
    expect(rebind({}, "loops", "x")).toEqual({ ok: false, reason: { kind: "reserved", with: "X" } });
    expect(rebind({ memory: "b" }, "spawn", "m")).toEqual({ ok: true, map: { memory: "b", spawn: "m" } });
  });
  it("자기 키를 다시 누르면 그대로, Delete 는 기본값 복원", () => {
    expect(rebind({}, "memory", "m")).toEqual({ ok: true, map: {} });
    expect(rebind({ loops: "b" }, "loops", "Delete")).toEqual({ ok: true, map: {} });
  });
  it("s·d 는 여전히 거절(이유는 Skills·Markdown 과 충돌)", () => {
    for (const k of ["s", "d"]) expect(rebind({}, "spawn", k).ok).toBe(false);
  });
});
