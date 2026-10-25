import { beforeEach, describe, expect, it, vi } from "vitest";

const stored: { v: Record<string, unknown> } = { v: {} };
const settingsSet = vi.fn(async (p: Record<string, unknown>) => ({ ...stored.v, ...p }));
vi.mock("../agents/api", () => ({ settingsGet: async () => stored.v, settingsSet: (p: Record<string, unknown>) => settingsSet(p) }));

import { useSettings } from "./useSettings";

beforeEach(() => {
  stored.v = {};
  settingsSet.mockClear();
  useSettings.setState({ s: useSettings.getState().get() });
});

describe("S-353 기본값", () => {
  it("키와 기본값", () => {
    expect(useSettings.getState().get()).toMatchObject({
      theme: "og", textSize: 100, reopenLastRepo: true, resumeAgentChats: true, yolo: false, liveStatus: false,
      altAsMeta: true, defaultShell: null, defaultAgent: null, agentPaths: {}, keymap: {}, profileName: "", avatarColor: 0, firstRunDone: false,
      usageChime: true, chimePlay: "only100", chimeSound: "Glass", // D10 S-1530
      speechLanguage: "auto", speechModel: "small", speechEnginePath: "", speechModelPath: "", voiceInput: "auto", // F2 S-2231
      holdSpace: true, dictateKey: "CtrlSpace", speakReplies: true, voiceName: "auto",
    });
  });
  it("load: 저장된 값이 기본값 위에 덮이고 모르는 키도 남는다", async () => {
    stored.v = { theme: "light", mystery: 7 };
    await useSettings.getState().load();
    expect(useSettings.getState().get()).toMatchObject({ theme: "light", textSize: 100, mystery: 7 });
  });
});

describe("S-352 patch", () => {
  it("바꾸면 즉시 상태가 바뀌고 settingsSet 에 그 조각만 간다", () => {
    useSettings.getState().patch({ textSize: 150 });
    expect(useSettings.getState().get().textSize).toBe(150);
    expect(settingsSet).toHaveBeenCalledWith({ textSize: 150 });
  });
  it("모르는 키를 지우지 않는다", async () => {
    stored.v = { mystery: 7 };
    await useSettings.getState().load();
    useSettings.getState().patch({ profileName: "Ann" });
    expect(useSettings.getState().get()).toMatchObject({ mystery: 7, profileName: "Ann" });
  });
});
