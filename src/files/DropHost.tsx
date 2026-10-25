// S-950~S-954: 창 드롭 → 보드에 노드. 홈 화면·숨은 보드에서는 무시한다(홈은 HomeScreen 이 폴더 추가로 받는다)
import { useEffect, useState } from "react";
import { getStore } from "../board/boards";
import { screenToWorld } from "../board/viewport";
import { fileCopyInto, fileStat, onFileDrop, type DropPos } from "../lib/ipc";
import { useShell } from "../shell/useShell";
import DropChoice, { type Choice } from "./DropChoice";
import { placeAll, prepare } from "./drop";
import { inRepo } from "./inRepo";

type Ask = { canCopy: boolean; count: number; done: (c: Choice | null) => void };

/** 창 물리 픽셀 → 월드 좌표. 보드 밖이거나 위치를 모르면 보이는 화면 가운데 */
function worldAt(wsId: string, pos: DropPos) {
  const v = getStore(wsId).getState().viewport;
  const r = document.querySelector(`[data-ws="${CSS.escape(wsId)}"] [data-testid="board"]`)?.getBoundingClientRect();
  if (pos && r) {
    const x = pos.x / window.devicePixelRatio, y = pos.y / window.devicePixelRatio;
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return screenToWorld(v, { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 });
  }
  return screenToWorld(v, { x: 0, y: 0 });
}

export default function DropHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  useEffect(() => {
    let pending: Ask | null = null;
    const choose = (a: Omit<Ask, "done">) => new Promise<Choice | null>((resolve) => {
      pending?.done(null); // 선택창이 떠 있는 중에 또 놓으면 앞의 것은 취소
      pending = { ...a, done: (c) => { if (pending === me) { pending = null; setAsk(null); } resolve(c); } };
      const me = pending;
      setAsk(pending);
    });
    const handle = async (paths: string[], pos: DropPos) => {
      const sh = useShell.getState();
      const repo = sh.activeRepo;
      const ws = sh.openRepos.find((r) => r.path === repo)?.activeWs;
      if (sh.view !== "board" || !repo || !ws || !paths.length) return;
      const at = worldAt(ws, pos);
      let list = paths;
      const outside = paths.filter((p) => !inRepo(p, repo));
      if (outside.length) {
        const isDir = await Promise.all(outside.map((p) => fileStat(p).then((s) => s.isDir, () => false)));
        const choice = await choose({ canCopy: isDir.some((d) => !d), count: outside.length });
        if (!choice) return; // 닫으면 아무것도 놓지 않는다
        if (choice === "copy") {
          const dirs = new Set(outside.filter((_, i) => isDir[i]));
          list = await Promise.all(paths.map((p) => (inRepo(p, repo) || dirs.has(p) ? p : fileCopyInto(p, repo).catch(() => p)))); // 폴더는 복사하지 않는다
        }
      }
      const items = await Promise.all(list.map((p) => prepare(p, repo)));
      const now = useShell.getState(); // 읽는 동안 다른 보드로 옮겼으면 놓지 않는다
      if (now.view !== "board" || now.activeRepo !== repo || now.openRepos.find((r) => r.path === repo)?.activeWs !== ws) return;
      placeAll(getStore(ws), items, at);
    };
    const off = onFileDrop((p, pos) => void handle(p, pos));
    return () => { off(); pending?.done(null); };
  }, []);
  return ask ? <DropChoice canCopy={ask.canCopy} count={ask.count} onPick={ask.done} /> : null;
}
