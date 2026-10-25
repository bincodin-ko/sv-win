// H2 S-2823: 지난 목록을 바로 보이고 뒤에서 새로 받는 저장소(실패해도 지난 목록은 남긴다).
import { create } from "zustand";
import { conversationsList, type Conversation } from "../lib/ipc";

interface ConvStore {
  list: Conversation[] | null;
  loading: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
}
export const useConvs = create<ConvStore>((set) => ({
  list: null,
  loading: false,
  error: null,
  load: async (force = false) => {
    set({ loading: true });
    try {
      set({ list: await conversationsList(force), error: null, loading: false });
    } catch (e) {
      set({ error: String((e as Error)?.message ?? e), loading: false });
    }
  },
}));
