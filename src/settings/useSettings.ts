// 설정 저장소 하나(S-352·S-353): 바꾸면 즉시 상태에 반영하고 settingsSet 으로 그 조각만 저장한다. 모르는 키는 지우지 않는다.
import { create } from "zustand";
import { settingsGet, settingsSet } from "../agents/api";
import { setLang } from "../i18n";

export type Settings = Record<string, unknown>;
export const SETTING_DEFAULTS: Settings = {
  theme: "og", textSize: 100, reopenLastRepo: true, resumeAgentChats: true, yolo: false, liveStatus: false, altAsMeta: true,
  defaultShell: null, defaultAgent: null, agentPaths: {}, keymap: {}, profileName: "", avatarColor: 0, firstRunDone: false,
  usageChime: true, chimePlay: "only100", chimeSound: "Glass", // D10 S-1530
  speechLanguage: "auto", speechModel: "small", speechEnginePath: "", speechModelPath: "", voiceInput: "auto", // F2 S-2231
  holdSpace: true, dictateKey: "CtrlSpace", speakReplies: true, voiceName: "auto",
  pdfPaper: "letter", pdfDir: "", // E2 S-1844·S-1851
  docsAgent: null, docsEffort: "balanced", // E6 S-1972·S-1973
  lowSpec: false, // 9묶음 저사양 모드
  planner: "claude", // 11묶음 S-2901
};

interface SettingsStore {
  s: Settings;
  load: () => Promise<void>;
  get: () => Settings;
  patch: (p: Settings) => void;
}
export const useSettings = create<SettingsStore>((set, get) => ({
  s: SETTING_DEFAULTS,
  load: async () => set({ s: { ...SETTING_DEFAULTS, ...(await settingsGet()) } }),
  get: () => get().s,
  patch: (p) => {
    set((st) => ({ s: { ...st.s, ...p } }));
    if (p.language === "en" || p.language === "ko") setLang(p.language); // S-2403 화면 언어는 여기 한 곳에서
    void settingsSet(p);
  },
}));
