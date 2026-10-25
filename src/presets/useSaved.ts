// B14 저장한 layout 목록(홈·보드·라이브러리가 함께 본다). 저장은 presetsGet/Set (B13 ipc)
import { create } from "zustand";
import { presetsGet, presetsSet } from "../lib/ipc";
import type { SavedLayout } from "./saved";

type S = { list: SavedLayout[]; loaded: boolean; load: () => Promise<void>; add: (l: SavedLayout) => Promise<void>; remove: (name: string) => Promise<void> };
export const useSaved = create<S>((set, get) => {
  const write = async (list: SavedLayout[]) => { set({ list }); await presetsSet(list); };
  return {
    list: [],
    loaded: false,
    load: async () => { if (!get().loaded) set({ list: await presetsGet(), loaded: true }); },
    add: async (l) => { await get().load(); await write([...get().list, l]); },
    remove: async (name) => { await get().load(); await write(get().list.filter((x) => x.name !== name)); },
  };
});
