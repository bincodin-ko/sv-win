// B13 홈에서 무장된 preset (이름 하나, 한 번 쓰면 해제)
import { create } from "zustand";

export const useArmedPreset = create<{
  armed: string | null;
  arm: (name: string | null) => void;
  /** 무장된 이름을 돌려주고 해제한다 */
  take: () => string | null;
}>((set, get) => ({
  armed: null,
  arm: (armed) => set({ armed }),
  take: () => {
    const a = get().armed;
    set({ armed: null });
    return a;
  },
}));
