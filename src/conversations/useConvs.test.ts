import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "../lib/ipc";

const list = vi.fn();
vi.mock("../lib/ipc", () => ({ conversationsList: (f?: boolean) => list(f) }));
import { useConvs } from "./useConvs";

const conv = { cli: "claude", sessionId: "a", cwd: "C:/x", cwdExists: true, title: "t", firstPrompt: "p", lastAt: 1, messages: 1, profile: null } as Conversation;

describe("S-2823 useConvs", () => {
  beforeEach(() => { list.mockReset(); useConvs.setState({ list: null, loading: false, error: null }); });
  it("load() 는 force=false, load(true) 는 force=true 로 부르고 결과를 담는다", async () => {
    list.mockResolvedValue([conv]);
    await useConvs.getState().load();
    expect(list).toHaveBeenLastCalledWith(false);
    await useConvs.getState().load(true);
    expect(list).toHaveBeenLastCalledWith(true);
    expect(useConvs.getState().list).toEqual([conv]);
    expect(useConvs.getState().error).toBeNull();
  });
  it("실패하면 오류 글을 담고, 지난 목록은 남긴다", async () => {
    list.mockResolvedValueOnce([conv]).mockRejectedValueOnce("boom");
    await useConvs.getState().load();
    await useConvs.getState().load(true);
    expect(useConvs.getState().error).toBe("boom");
    expect(useConvs.getState().list).toEqual([conv]);
    expect(useConvs.getState().loading).toBe(false);
  });
});
