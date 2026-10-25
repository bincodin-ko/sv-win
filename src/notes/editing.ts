// S-840·S-843·S-844: 지금 글을 편집 중인 스티커/텍스트 노드. 놓자마자(placeNew 직후) 켜고, 확정(blur)하면 끈다
import { flushSync } from "react-dom";
import { create } from "zustand";
import type { BoardStore } from "../board/boards";
import { isEmptyText } from "./textNode";

type Editing = { id: string | null; fresh: number | null; start: (id: string, fresh?: number) => void; stop: () => void };
/** fresh = 방금 놓았을 때 되돌리기 쌓임 길이. 비운 채 떠나면 그 한 단계를 같이 버린다(S-844) */
export const useEditing = create<Editing>((set) => ({ id: null, fresh: null, start: (id, fresh) => set({ id, fresh: fresh ?? null }), stop: () => set({ id: null, fresh: null }) }));

/** 더블클릭 재편집(S-843·S-847): 편집기를 그 자리에서 그리고 포커스까지 잡는다. 늦게(setTimeout) 잡으면 그 사이 키(Delete 등)가 보드로 가서 노드를 지운다 */
export function editNow(id: string, host: HTMLElement): void {
  flushSync(() => useEditing.getState().start(id));
  const el = host.querySelector("textarea");
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

/** 글 확정. 텍스트 상자가 비면 사라진다: 방금 놓은 것이면 되돌리기 기록도 안 남기고, 다시 편집한 것이면 지우기 1단계 */
export function finishText(store: BoardStore, id: string, value: string, opts: { vanishIfEmpty: boolean }): void {
  const { fresh } = useEditing.getState();
  useEditing.getState().stop();
  const s = store.getState();
  const n = s.nodes[id];
  if (!n) return;
  if (opts.vanishIfEmpty && isEmptyText(value)) {
    if (fresh !== null && s.history.past.length === fresh) {
      s.removeNodes([id], true);
      store.setState((st) => ({ history: { ...st.history, past: st.history.past.slice(0, -1) } }));
    } else s.removeNodes([id]);
    return;
  }
  if (value === (n.text ?? "")) return;
  s.commit();
  s.updateNode(id, { text: value });
}
