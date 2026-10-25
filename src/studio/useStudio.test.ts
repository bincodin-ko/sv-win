import { beforeEach, describe, expect, it, vi } from "vitest";
import { useShell } from "../shell/useShell";
import { useUi } from "../ui/useUi";
import { registerStudio, resetStudios } from "./registry";
import { setUnsavedAsker, unsaved } from "./unsaved";
import { requestCloseStudio, requestOpenStudio } from "./useStudio";

const C = () => null;
beforeEach(() => {
  resetStudios();
  unsaved.clear();
  useUi.setState({ studio: { open: null } });
  useShell.setState({ activeRepo: "C:/r" });
  for (const [i, id] of (["code", "markdown", "documents", "skills"] as const).entries()) registerStudio({ id, title: id, order: i, Component: C });
});

describe("S-1800 useUi.studio", () => {
  it("openStudio·closeStudio 가 열린 id 와 arg 를 바꾼다(하나만)", () => {
    useUi.getState().openStudio("code", "src/a.ts");
    expect(useUi.getState().studio).toEqual({ open: "code", arg: "src/a.ts" });
    useUi.getState().openStudio("skills");
    expect(useUi.getState().studio).toEqual({ open: "skills" });
    useUi.getState().closeStudio();
    expect(useUi.getState().studio.open).toBeNull();
  });
});

describe("S-1803 repo 요구", () => {
  it("repo 가 없으면 Code·Markdown·Documents 는 못 열고 Skills 는 열린다", async () => {
    useShell.setState({ activeRepo: null });
    for (const id of ["code", "markdown", "documents"] as const) expect(await requestOpenStudio(id)).toBe("Open a repo first.");
    expect(useUi.getState().studio.open).toBeNull();
    expect(await requestOpenStudio("skills")).toBeNull();
    expect(useUi.getState().studio.open).toBe("skills");
  });
  it("등록 안 된 스튜디오는 LATER 문구", async () => {
    resetStudios();
    expect(await requestOpenStudio("code")).toBe("That isn't available in this version yet.");
    expect(useUi.getState().studio.open).toBeNull();
  });
});

describe("S-1810 닫기·바꾸기 확인", () => {
  it("저장 안 한 게 있으면 Cancel 로 그대로, Don't Save 로 닫힌다", async () => {
    await requestOpenStudio("code", "a");
    const u = { label: "code", dirty: () => true, save: vi.fn(() => true), discard: vi.fn() };
    unsaved.register("a", u);
    setUnsavedAsker(vi.fn().mockResolvedValueOnce("cancel").mockResolvedValueOnce("discard"));
    expect(await requestOpenStudio("markdown")).toBe("Cancelled.");
    expect(useUi.getState().studio.open).toBe("code");
    expect(await requestCloseStudio()).toBe(true);
    expect(useUi.getState().studio.open).toBeNull();
    expect(u.discard).toHaveBeenCalledOnce();
  });
  it("Save 가 실패하면 닫지 않는다", async () => {
    await requestOpenStudio("code");
    unsaved.register("a", { label: "code", dirty: () => true, save: () => false, discard: vi.fn() });
    setUnsavedAsker(vi.fn().mockResolvedValue("save"));
    expect(await requestCloseStudio()).toBe(false);
    expect(useUi.getState().studio.open).toBe("code");
  });
  it("열린 게 없으면 닫기는 그냥 true", async () => {
    expect(await requestCloseStudio()).toBe(true);
  });
});
