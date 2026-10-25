// D12: 계정 프로필 목록 저장소(zustand + ipc) — Accounts 화면·usage 계정 칩·AgentPicker 가 같이 쓴다
import { create } from "zustand";
import { getStore } from "../board/boards";
import { liveInstallProfile, profileCreate, profileList, profileRemove, profileRename, profileStatus, type Profile, type ProfileAgent } from "../lib/ipc";
import { useSettings } from "../settings/useSettings";
import { useShell } from "../shell/useShell";

type Use = Record<string, string | null | undefined>;
const useMap = (): Use => (useSettings.getState().get().profileUse as Use | undefined) ?? {};
/** S-1624: 새 콘솔과 숨은 세션이 쓸 계정. id = null 이면 기본 로그인 */
export const setUse = (agent: ProfileAgent, id: string | null) => useSettings.getState().patch({ profileUse: { ...useMap(), [agent]: id } });
export const usedFor = (agent: string): string | null => useMap()[agent] ?? null;

/** 활성 워크스페이스 보드에 그 계정의 콘솔을 놓는다. 앱은 콘솔에 아무것도 입력하지 않는다(S-1623) */
export function placeConsole(agent: ProfileAgent, id: string | null) {
  const sh = useShell.getState();
  const ws = sh.openRepos.find((x) => x.path === sh.activeRepo)?.activeWs;
  if (ws) getStore(ws).getState().spawnConsole(agent, undefined, { profile: id });
}

interface ProfilesStore {
  list: Profile[];
  signed: Record<string, boolean>;
  load: () => Promise<void>;
  create: (agent: ProfileAgent, name: string) => Promise<Profile>;
  rename: (agent: ProfileAgent, id: string, name: string) => Promise<void>;
  remove: (agent: ProfileAgent, id: string) => Promise<void>;
}
export const useProfiles = create<ProfilesStore>((set, get) => ({
  list: [],
  signed: {},
  load: async () => {
    const list = await profileList().catch(() => [] as Profile[]);
    const signed = Object.fromEntries(await Promise.all(list.map(async (p) => [`${p.agent}/${p.id}`, await profileStatus(p.agent, p.id).catch(() => false)] as const)));
    set({ list, signed });
  },
  create: async (agent, name) => {
    const p = await profileCreate(agent, name);
    // S-1629: 라이브 상태가 켜져 있으면 새 프로필 폴더에도 hook 항목을 넣는다
    if (useSettings.getState().get().liveStatus === true) await liveInstallProfile(agent, p.id).catch(() => {});
    await get().load();
    return p;
  },
  rename: async (agent, id, name) => {
    await profileRename(agent, id, name); // S-1632: 목록만(폴더 이름은 그대로)
    await get().load();
  },
  remove: async (agent, id) => {
    await profileRemove(agent, id);
    if (usedFor(agent) === id) setUse(agent, null); // S-1630
    await get().load();
  },
}));
