// D10 S-1518·S-1520: 확인 결과를 메모리에 둔다(에이전트·계정마다). 저장하지 않는다
import { create } from "zustand";
import { realClock } from "../hidden/screen";
import { profileEnv, type ProfileAgent } from "../lib/ipc";
import { BG_MAX_AGE, checkUsage, isStale, type UsageResult } from "./probe";

interface UsageStore {
  results: Record<string, UsageResult>;
  busy: Record<string, boolean>;
  /** 시각과 상관없이 바로 확인(새로고침). 같은 키가 진행 중이면 무시 */
  check: (agent: string, o: { manual: boolean; account?: string | null }) => Promise<void>;
  /** 마지막 확인이 maxAgeMs 보다 오래됐을 때만 */
  ensureFresh: (agent: string, maxAgeMs: number, manual: boolean, account?: string | null) => Promise<void>;
  /** 보드가 열릴 때: 3분보다 오래됐으면 백그라운드(manual:false)로 */
  boardOpened: (agents: string[]) => void;
}
export const usageKey = (agent: string, account?: string | null) => (account ? `${agent}:${account}` : agent);

export const useUsage = create<UsageStore>((set, get) => ({
  results: {},
  busy: {},
  async check(agent, { manual, account }) {
    const key = usageKey(agent, account);
    if (get().busy[key]) return;
    set((s) => ({ busy: { ...s.busy, [key]: true } }));
    let res: UsageResult;
    try {
      const env = account ? [await profileEnv(agent as ProfileAgent, account)] : [];
      res = await checkUsage(agent, { manual, env, tag: key });
    } catch (e) {
      res = { at: realClock.now(), agent, parsed: null, raw: String((e as Error)?.message ?? e), state: "failed" };
    }
    set((s) => ({ results: { ...s.results, [key]: res }, busy: { ...s.busy, [key]: false } }));
  },
  async ensureFresh(agent, maxAgeMs, manual, account) {
    if (isStale(get().results[usageKey(agent, account)]?.at, realClock.now(), maxAgeMs)) await get().check(agent, { manual, account });
  },
  boardOpened(agents) {
    for (const a of agents) void get().ensureFresh(a, BG_MAX_AGE, false);
  },
}));
