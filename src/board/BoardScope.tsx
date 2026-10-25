import { createContext, useContext, useMemo } from "react";
import { DEFAULT_SCOPE, type BoardStore, type Scope } from "./boards";

// B2: 보드 화면이 자기 워크스페이스·저장소·보임 여부를 받는 문맥. 밖에서는 기본 저장소.
type Ctx = Scope & { visible: boolean };
const C = createContext<Ctx>({ ...DEFAULT_SCOPE, visible: true });

export function BoardScope({ wsId, store, visible, children }: { wsId: string; store: BoardStore; visible: boolean; children: React.ReactNode }) {
  const v = useMemo(() => ({ wsId, store, visible }), [wsId, store, visible]);
  return <C.Provider value={v}>{children}</C.Provider>;
}
export const useScope = () => useContext(C);
/** 컨텍스트 저장소. 훅이자 getState/setState 를 가진 zustand 저장소 */
export const useBoardStore = (): BoardStore => useContext(C).store;
