// 1-4: 콘솔 크게 보기 상태. key = sessionKey(wsId, nodeId) 하나만 켜진다(노드 DOM 은 그대로, Board 가 고정 위치 스타일만 바꾼다)
import { create } from "zustand";

export const useMax = create<{ key: string | null }>(() => ({ key: null }));
export const toggleMax = (key: string): void => useMax.setState((s) => ({ key: s.key === key ? null : key }));
export const closeMax = (): void => useMax.setState({ key: null });
