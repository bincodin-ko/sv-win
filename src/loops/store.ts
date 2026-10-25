// D5 Loops 저장소: 정의(repo 별 저장, S-1401), 이번 실행의 기록 20개(S-1414), 실행 상태(저장 안 함), 켜기/끄기·수정·삭제(S-1417)
import { create } from "zustand";
import { loopsGet, loopsSet } from "../lib/ipc";
import { askPermission } from "./notify";
import { loopNow } from "./trigger";
import { normalize, type Loop } from "./types";

export type Entry = { at: number; loop: string; kind: "run" | "skip" | "stop" | "goal"; text: string };
/** 켠 동안만 있는 실행 상태. nextAt = 스케줄 loop 의 다음 실행 시각 */
export type Rt = { startedAt: number; runs: number; nextAt: number | null };
type S = {
  loops: Loop[];
  history: Entry[];
  rt: Record<string, Rt>;
  /** 그 repo 의 정의를 불러온다(모두 꺼짐) */
  load(repo: string): Promise<void>;
  add(d: Omit<Loop, "id" | "enabled">): string;
  update(id: string, p: Partial<Omit<Loop, "id" | "repo">>): void;
  remove(id: string): void;
  setEnabled(id: string, on: boolean): void;
  log(e: Entry): void;
};
export const HISTORY_MAX = 20;

let seq = 0;
const loaded = new Set<string>(); // 한 번이라도 불러온 repo
const fresh = (l: Loop, now: number): Rt => ({ startedAt: now, runs: 0, nextAt: l.trigger.kind === "schedule" ? now + l.trigger.everyMin * 60_000 : null });

export const useLoops = create<S>((set, get) => {
  // S-1401: 불러오기가 끝나기 전 저장은 미룬다(안 불렀으면 먼저 불러온다) — 파일의 옛 정의를 새 것만으로 덮지 않게
  const loading = new Map<string, Promise<void>>();
  const save = (repo: string) => void (loading.get(repo) ?? (loaded.has(repo) ? Promise.resolve() : get().load(repo))).then(() => loopsSet(repo, get().loops.filter((l) => l.repo === repo))).catch(() => {});
  const change = (id: string, f: (l: Loop) => Loop) => {
    const old = get().loops.find((l) => l.id === id);
    if (!old) return;
    const l = f(old);
    set((s) => ({ loops: s.loops.map((x) => (x.id === id ? l : x)) }));
    save(l.repo);
  };
  return {
    loops: [],
    history: [],
    rt: {},
    load: (repo) => {
      const p = (async () => {
        const list = (await loopsGet(repo).catch(() => [] as Loop[])).map((l) => normalize({ ...l, repo, enabled: false }));
        // 합친다: 같은 id 는 메모리 것을 두고, 나머지는 불러온 것을 더한다
        set((s) => ({ loops: [...s.loops, ...list.filter((l) => !s.loops.some((x) => x.id === l.id))] }));
      })();
      loading.set(repo, p);
      void p.then(() => { loaded.add(repo); if (loading.get(repo) === p) loading.delete(repo); });
      return p;
    },
    add: (d) => {
      const l = normalize({ ...d, id: `loop-${loopNow().toString(36)}-${++seq}`, enabled: false });
      set((s) => ({ loops: [...s.loops, l] }));
      save(l.repo);
      askPermission();
      return l.id;
    },
    update: (id, p) => change(id, (l) => normalize({ ...l, ...p })),
    remove: (id) => {
      const l = get().loops.find((x) => x.id === id);
      if (!l) return;
      set((s) => {
        const { [id]: _gone, ...rt } = s.rt;
        return { loops: s.loops.filter((x) => x.id !== id), rt };
      });
      save(l.repo);
    },
    setEnabled: (id, on) => {
      change(id, (l) => ({ ...l, enabled: on }));
      const l = get().loops.find((x) => x.id === id);
      if (!l) return;
      set((s) => {
        const { [id]: _old, ...rt } = s.rt;
        return { rt: on ? { ...rt, [id]: fresh(l, loopNow()) } : rt };
      });
      if (on) askPermission();
    },
    log: (e) => set((s) => ({ history: [...s.history, e].slice(-HISTORY_MAX) })),
  };
});

/** 켜진 loop 수(우측 레일 배지·Mission Map) */
export const runningLoops = (): number => useLoops.getState().loops.filter((l) => l.enabled).length;
