// S-553·S-554·S-557: Thread 메시지. 저장 모양은 여기서만 정한다.
import { create } from "zustand";
import { threadLoad, threadSave } from "../lib/ipc";

export type MsgRole = "user" | "bot" | "plan" | "report";
/** 보고 행: 콘솔 이름·소요 시간·결과·답 앞부분·See output 이 가리킬 노드 */
export type Report = { console: string; nodeId?: string; wsId?: string; secs: number; result: string; reply?: string };
export type Msg = { id: string; at: number; role: MsgRole; text: string; report?: Report };

export const MAX_MESSAGES = 500;

let seq = 0;
export function mk(role: MsgRole, text: string, extra?: { report?: Report }): Msg {
  return { id: `m${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), role, text, ...extra };
}
/** 최근 500개만 남긴다(오래된 것부터 버림) */
export const trim = (ms: Msg[]): Msg[] => (ms.length > MAX_MESSAGES ? ms.slice(-MAX_MESSAGES) : ms);

export const serialize = (ms: Msg[]): string => JSON.stringify(ms);

const ROLES: string[] = ["user", "bot", "plan", "report"];
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** 읽지 못하면 빈 목록. 모양이 틀린 항목만 버린다 */
export function parse(json: string): Msg[] {
  let v: unknown;
  try { v = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(v)) return [];
  return v.flatMap((m): Msg[] => {
    if (!isRec(m) || typeof m.id !== "string" || typeof m.at !== "number" || typeof m.text !== "string" || !ROLES.includes(m.role as string)) return [];
    return [{ id: m.id, at: m.at, role: m.role as MsgRole, text: m.text, ...(isRec(m.report) ? { report: m.report as Report } : {}) }];
  });
}

type ThreadStore = {
  byRepo: Record<string, Msg[]>;
  open: boolean;
  setOpen: (o: boolean) => void;
  /** repo 의 저장된 스레드를 불러온다(이미 메모리에 있으면 그대로). 바가 뜰 때 한 번 부른다 */
  load: (repo: string) => Promise<void>;
  add: (repo: string, m: Msg) => void;
  clear: (repo: string) => void;
};

// 저장은 한 줄로 이어서(같은 임시 파일을 동시에 쓰지 않게)
let chain: Promise<unknown> = Promise.resolve();
const persist = (repo: string, ms: Msg[]) => {
  const json = serialize(ms);
  chain = chain.then(() => threadSave(repo, json)).catch(() => {});
};

export const useThread = create<ThreadStore>((set, get) => ({
  byRepo: {},
  open: false,
  setOpen: (open) => set({ open }),
  load: async (repo) => {
    if (get().byRepo[repo]) return;
    const stored = trim(parse(await threadLoad(repo)));
    set((s) => (s.byRepo[repo] ? s : { byRepo: { ...s.byRepo, [repo]: stored } }));
  },
  add: (repo, m) => {
    const ms = trim([...(get().byRepo[repo] ?? []), m]);
    set((s) => ({ byRepo: { ...s.byRepo, [repo]: ms } }));
    persist(repo, ms);
  },
  clear: (repo) => {
    set((s) => ({ byRepo: { ...s.byRepo, [repo]: [] } }));
    persist(repo, []);
  },
}));
