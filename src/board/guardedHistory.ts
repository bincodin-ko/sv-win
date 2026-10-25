import { getSession } from "../console/session";
import { confirmClose } from "../console/ConfirmClose";
import type { Scope } from "./boards";
import { isConsole } from "./store";

/** 되돌리기/다시 실행이 실행 중 콘솔을 지우게 되면 확인창 먼저. 취소하면 하지 않는다. 했으면 true */
export async function requestHistory(dir: "undo" | "redo", sc: Scope): Promise<boolean> {
  const s = sc.store.getState();
  const stack = dir === "undo" ? s.history.past : s.history.future;
  const target = stack[stack.length - 1]?.nodes;
  if (!target) return false;
  const gone = Object.values(s.nodes).flatMap((n) => (isConsole(n) && !target[n.id] && getSession(sc.wsId, n.id)?.isRunning() ? [n.name] : []));
  if (gone.length && !(await confirmClose(gone))) return false;
  return sc.store.getState()[dir]();
}
