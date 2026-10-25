import { beforeEach, describe, expect, it } from "vitest";
import { useUi } from "./useUi";

// D1 S-1230: Mission Map·Memory·Loops 는 한 번에 하나만, Usage popover 는 따로
const s = () => useUi.getState();
const open = () => ({ mission: s().mission.open, memory: s().memory.open, loops: s().loops.open });
beforeEach(() => useUi.setState({ mission: { open: false }, memory: { open: false }, loops: { open: false }, usage: { open: false, view: "usage" }, connect: null }));

describe("S-1230 useUi 패널 상태", () => {
  it("처음엔 모두 닫혀 있고 연결 모드는 꺼져 있다", () => {
    expect(open()).toEqual({ mission: false, memory: false, loops: false });
    expect(s().usage).toEqual({ open: false, view: "usage" });
    expect(s().connect).toBeNull();
  });
  it("openX 로 열고 closeX 로 닫고 toggleX 는 뒤집는다", () => {
    s().openMission();
    expect(open()).toEqual({ mission: true, memory: false, loops: false });
    s().closeMission();
    expect(s().mission.open).toBe(false);
    s().toggleMemory();
    expect(s().memory.open).toBe(true);
    s().toggleMemory();
    expect(s().memory.open).toBe(false);
    s().toggleLoops();
    expect(s().loops.open).toBe(true);
  });
  it("Mission Map·Memory·Loops 는 하나만: 다른 걸 열면 앞의 것이 닫힌다", () => {
    s().openMission();
    s().openMemory();
    expect(open()).toEqual({ mission: false, memory: true, loops: false });
    s().toggleLoops();
    expect(open()).toEqual({ mission: false, memory: false, loops: true });
    s().openMission();
    expect(open()).toEqual({ mission: true, memory: false, loops: false });
  });
  it("Usage popover 는 따로: 열려 있어도 패널을 열면 안 닫히고, 반대도 같다. view·agent 를 받는다", () => {
    s().openUsage("tokens", "claude");
    expect(s().usage).toEqual({ open: true, view: "tokens", agent: "claude" });
    s().openMemory();
    expect(s().usage.open).toBe(true);
    s().closeUsage();
    expect(s().usage.open).toBe(false);
    expect(s().memory.open).toBe(true);
    s().openUsage();
    expect(s().usage.view).toBe("usage");
    s().toggleUsage();
    expect(s().usage.open).toBe(false);
  });
});

// U1 S-2607: 설정 창은 같은 실행 중 마지막으로 본 pane 으로 열린다(처음은 account)
describe("S-2607 설정 마지막 pane", () => {
  it("처음엔 account, 닫았다 다시 열면 마지막 pane, 명시하면 그 pane", () => {
    useUi.setState({ settings: { open: false, pane: "account" } });
    s().openSettings();
    expect(s().settings.pane).toBe("account");
    s().openSettings("voice");
    s().closeSettings();
    s().openSettings();
    expect(s().settings).toEqual({ open: true, pane: "voice" });
    s().openSettings("about");
    expect(s().settings.pane).toBe("about");
  });
});
