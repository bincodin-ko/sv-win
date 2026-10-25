// S-959: 파일 폴링 상태기계(순수, 주기·시계 주입) + React 훅
import { useEffect, useState } from "react";
import { fileStat, fileText, type FileStat, type FileTextResult } from "../lib/ipc";

export type WatchResult = FileTextResult | { kind: "deleted" };
export type WatchOpts = {
  path: string;
  stat: (p: string) => Promise<FileStat>;
  read: (p: string) => Promise<FileTextResult>;
  isVisible: () => boolean;
  onResult: (r: WatchResult) => void;
  every?: number;
  timer?: { set: (f: () => void, ms: number) => unknown; clear: (id: unknown) => void };
};

/** tick = 보이면 stat 을 보고, 크기·시각이 달라졌을 때(또는 처음·지워졌다 돌아왔을 때)만 읽는다 */
export function createFileWatch(o: WatchOpts) {
  let sig: string | null = null; // null = 아직 안 읽음 / 지워짐
  let busy = false;
  let id: unknown;
  const timer = o.timer ?? { set: (f, ms) => setInterval(f, ms), clear: (i) => clearInterval(i as number) };
  async function tick() {
    if (busy || !o.isVisible()) return;
    busy = true;
    try {
      const s = await o.stat(o.path);
      if (!s.exists || s.isDir) {
        if (sig !== "deleted") { sig = "deleted"; o.onResult({ kind: "deleted" }); }
        return;
      }
      const next = `${s.size}:${s.mtime}`;
      if (next === sig) return;
      sig = next;
      o.onResult(await o.read(o.path));
    } catch (e) {
      sig = null; // 다음 tick 에 다시 시도
      o.onResult({ kind: "error", message: String(e) });
    } finally {
      busy = false;
    }
  }
  return {
    tick,
    start() { void tick(); id = timer.set(() => void tick(), o.every ?? 1000); },
    stop() { timer.clear(id); },
  };
}

/** 카드가 보이는 동안 1초마다 확인한다. null = 아직 안 읽음 */
export function useFileWatch(path: string, every = 1000): WatchResult | null {
  const [res, setRes] = useState<WatchResult | null>(null);
  useEffect(() => {
    setRes(null);
    const w = createFileWatch({ path, stat: fileStat, read: (p) => fileText(p), isVisible: () => document.visibilityState === "visible", onResult: setRes, every });
    w.start();
    return () => w.stop();
  }, [path, every]);
  return res;
}
