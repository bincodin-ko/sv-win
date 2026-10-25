import { describe, expect, it } from "vitest";
import { createFileWatch, type WatchResult } from "./useFileWatch";
import type { FileStat, FileTextResult } from "../lib/ipc";

function rig() {
  const s = { stat: { exists: true, isDir: false, size: 3, mtime: 100 } as FileStat, text: "abc", visible: true, statCalls: 0, readCalls: 0 };
  const out: WatchResult[] = [];
  let cb: (() => void) | null = null;
  let timerOn = false;
  const w = createFileWatch({
    path: "C:/x/a.md",
    stat: async () => { s.statCalls++; return { ...s.stat }; },
    read: async (): Promise<FileTextResult> => { s.readCalls++; return { kind: "text", text: s.text }; },
    isVisible: () => s.visible,
    onResult: (r) => out.push(r),
    every: 1000,
    timer: { set: (f, ms) => { expect(ms).toBe(1000); cb = f; timerOn = true; return 1; }, clear: () => { timerOn = false; cb = null; } },
  });
  return { s, out, w, fire: () => cb?.(), on: () => timerOn };
}

describe("S-959 파일 폴링", () => {
  it("처음 한 번은 읽는다", async () => {
    const r = rig();
    await r.w.tick();
    expect(r.s.readCalls).toBe(1);
    expect(r.out).toEqual([{ kind: "text", text: "abc" }]);
  });
  it("크기·시각이 안 바뀌면 다시 안 읽는다", async () => {
    const r = rig();
    await r.w.tick();
    await r.w.tick();
    await r.w.tick();
    expect(r.s.statCalls).toBe(3);
    expect(r.s.readCalls).toBe(1);
    expect(r.out.length).toBe(1);
  });
  it("시각만 바뀌어도 읽는다", async () => {
    const r = rig();
    await r.w.tick();
    r.s.stat.mtime = 200; r.s.text = "xyz";
    await r.w.tick();
    expect(r.s.readCalls).toBe(2);
    expect(r.out[1]).toEqual({ kind: "text", text: "xyz" });
  });
  it("크기만 바뀌어도 읽는다", async () => {
    const r = rig();
    await r.w.tick();
    r.s.stat.size = 9; r.s.text = "abcdefghi";
    await r.w.tick();
    expect(r.s.readCalls).toBe(2);
  });
  it("지워지면 deleted 를 한 번만 알리고, 다시 생기면 읽는다", async () => {
    const r = rig();
    await r.w.tick();
    r.s.stat = { exists: false, isDir: false, size: 0, mtime: 0 };
    await r.w.tick();
    await r.w.tick();
    expect(r.out.filter((x) => x.kind === "deleted").length).toBe(1);
    expect(r.s.readCalls).toBe(1);
    r.s.stat = { exists: true, isDir: false, size: 3, mtime: 100 }; // 전과 같은 크기·시각이어도 읽는다
    await r.w.tick();
    expect(r.s.readCalls).toBe(2);
    expect(r.out[r.out.length - 1]).toEqual({ kind: "text", text: "abc" });
  });
  it("안 보일 때는 stat 도 안 부른다", async () => {
    const r = rig();
    r.s.visible = false;
    await r.w.tick();
    expect(r.s.statCalls).toBe(0);
    r.s.visible = true;
    await r.w.tick();
    expect(r.s.readCalls).toBe(1);
  });
  it("start 는 주입한 주기로 돌고 stop 하면 멈춘다", async () => {
    const r = rig();
    r.w.start();
    expect(r.on()).toBe(true);
    await Promise.resolve();
    r.w.stop();
    expect(r.on()).toBe(false);
  });
});
