// B15 S-660: 콘솔별 마지막 답. 키 = (워크스페이스, 노드). 아이콘 표시와 viewer 가 같은 값을 본다
import { create } from "zustand";
import { sessionKey } from "../console/sessionKey";

export const useOutputs = create<{ replies: Record<string, string> }>(() => ({ replies: {} }));
/** text 가 null 이면 지운다 */
export function setReply(wsId: string, nodeId: string, text: string | null): void {
  useOutputs.setState((s) => {
    const k = sessionKey(wsId, nodeId);
    if (text === null) {
      if (!(k in s.replies)) return s;
      const { [k]: _gone, ...rest } = s.replies;
      return { replies: rest };
    }
    return s.replies[k] === text ? s : { replies: { ...s.replies, [k]: text } };
  });
}
