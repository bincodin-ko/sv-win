import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draftGet, studioMemoryDir, studioRead, studioTree, studioVault, studioWrite } from "../lib/ipc";
import { draftSaver } from "./drafts";

beforeEach(() => { vi.useFakeTimers(); (window as unknown as { __fakeStudio?: unknown }).__fakeStudio = { files: {} }; });
afterEach(() => vi.useRealTimers());

describe("S-1811 초안", () => {
  it("쉬면 초안을 남기고, 계속 치면 미루고, clear 하면 지운다", async () => {
    let text = "a";
    const d = draftSaver("C:/r/a.md", () => text, () => 5, 800);
    d.schedule();
    await vi.advanceTimersByTimeAsync(500);
    text = "ab";
    d.schedule();
    await vi.advanceTimersByTimeAsync(500);
    expect(await draftGet("C:/r/a.md")).toBeNull();
    await vi.advanceTimersByTimeAsync(400);
    expect(await draftGet("C:/r/a.md")).toMatchObject({ text: "ab", baseMtime: 5 });
    await d.clear();
    expect(await draftGet("C:/r/a.md")).toBeNull();
  });
});

describe("가짜 스튜디오 파일 시스템(__fakeStudio)", () => {
  it("트리·읽기·쓰기 충돌·vault·memory 폴더", async () => {
    (window as unknown as { __fakeStudio: unknown }).__fakeStudio = { files: { "C:/r/src/a.ts": "x", "C:/r/B.md": "#", "C:/r/node_modules/m.md": "#", "C:/r/.env": "s", "C:/r/.gitignore": "n", "C:/r/bin.dat": "\0\0", "C:/r/docs/n.md": "#" } };
    expect((await studioTree("C:/r", "C:/r")).map((e) => e.name)).toEqual(["docs", "src", ".gitignore", "B.md"]);
    expect((await studioRead("C:/r/src/a.ts")).text).toBe("x");
    expect((await studioRead("C:/r/bin.dat")).unreadable).toBe("binary");
    const { mtimeMs } = await studioWrite("C:/r/src/a.ts", "y", "utf-8", false, false);
    await expect(studioWrite("C:/r/src/a.ts", "z", "utf-8", false, false, mtimeMs + 1)).rejects.toBe("changed");
    await studioWrite("C:/r/src/a.ts", "z", "utf-8", false, false, mtimeMs + 1, true);
    expect((await studioRead("C:/r/src/a.ts")).text).toBe("z");
    const v = await studioVault("C:/r", 2000);
    expect(v.files.map((f) => f.name)).toEqual(["B.md", "n.md"]);
    expect((await studioVault("C:/r", 1)).truncated).toBe(true);
    expect(await studioMemoryDir("C:\\work\\내 repo")).toBe("C:/fake/.claude/projects/C--work---repo/memory");
  });
});
