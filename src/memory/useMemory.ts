// S-1363~S-1367: 사실 목록 저장소 (파일이 원본: 열 때 memory_load, 바꿀 때마다 memory_save)
import { create } from "zustand";
import { t } from "../i18n";
import { memoryLoad, memorySave, type MemoryFact } from "../lib/ipc";
import { newFact, type Draft } from "./facts";

type S = {
  /** 키 = repo 경로 또는 "_all" */
  data: Record<string, MemoryFact[]>;
  tab: "repo" | "all";
  editing: Draft | null;
  delArm: string | null;
  /** S-1353: 저장 실패 한 줄 */
  error: string | null;
  load: (repo: string | null) => Promise<void>;
  setTab: (t: "repo" | "all") => void;
  startNew: () => void;
  startEdit: (f: MemoryFact) => void;
  closeEdit: () => void;
  reset: () => void;
  save: (repo: string | null, d: Draft) => Promise<void>;
  del: (repo: string | null, f: MemoryFact) => Promise<void>;
};
const key = (repo: string | null, scope: "repo" | "all") => (scope === "repo" && repo ? repo : "_all");
export const saveError = (e: unknown) => t("Could not save memory: {msg}", { msg: e instanceof Error ? e.message : String(e) });
let armTimer: ReturnType<typeof setTimeout> | undefined;

export const useMemory = create<S>((set, get) => {
  /** 바뀐 목록들을 데이터에 넣고 그 파일만 저장 */
  const put = async (repo: string | null, changed: Record<string, MemoryFact[]>) => {
    const before = get().data;
    set((s) => ({ data: { ...s.data, ...changed }, error: null }));
    try {
      await Promise.all(Object.entries(changed).map(([k, list]) => memorySave(repo ?? "", k === "_all" ? "all" : "repo", list)));
    } catch (e) { // S-1353: 저장 실패 → 이전 목록으로 되돌리고 한 줄 오류
      set((s) => ({ data: { ...s.data, ...Object.fromEntries(Object.keys(changed).map((k) => [k, before[k]!])) }, error: saveError(e) }));
    }
  };
  return {
    data: {}, tab: "repo", editing: null, delArm: null, error: null,
    load: async (repo) => {
      const m = await memoryLoad(repo ?? "");
      set((s) => ({ data: { ...s.data, ...(repo ? { [repo]: m.repo } : {}), _all: m.all } }));
    },
    setTab: (tab) => set({ tab }),
    startNew: () => set({ editing: { kind: "Context", title: "", body: "", scope: get().tab } }),
    startEdit: (f) => set({ editing: { id: f.id, kind: f.kind, title: f.title, body: f.body, scope: f.scope } }),
    closeEdit: () => set({ editing: null }),
    reset: () => { clearTimeout(armTimer); set({ editing: null, delArm: null, error: null }); },
    save: async (repo, d) => {
      const to = key(repo, d.scope);
      const d0 = { ...d, scope: to === "_all" ? ("all" as const) : ("repo" as const) };
      const data = get().data;
      const from = d.id ? [key(repo, "repo"), "_all"].find((k) => data[k]?.some((f) => f.id === d.id)) : undefined;
      const fact = newFact(d0);
      const changed: Record<string, MemoryFact[]> = {};
      if (from === to) changed[to] = data[to]!.map((f) => (f.id === d.id ? { ...fact, at: f.at } : f));
      else {
        if (from) changed[from] = data[from]!.filter((f) => f.id !== d.id);
        changed[to] = [...(data[to] ?? []), fact];
      }
      set({ editing: null });
      await put(repo, changed);
    },
    del: async (repo, f) => {
      clearTimeout(armTimer);
      if (get().delArm !== f.id) {
        set({ delArm: f.id });
        armTimer = setTimeout(() => set({ delArm: null }), 3000);
        return;
      }
      const k = key(repo, f.scope);
      set({ delArm: null, editing: null });
      await put(repo, { [k]: (get().data[k] ?? []).filter((x) => x.id !== f.id) });
    },
  };
});
