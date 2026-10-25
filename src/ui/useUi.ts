// 화면 위에 뜨는 것들의 열림 상태. 뒤 일감이 필드를 덧붙인다(B1 은 settings 만 쓴다).
import { create } from "zustand";
import type { StudioId } from "../studio/registry";

interface UiStore {
  settings: { open: boolean; pane: string };
  presetsOpen: boolean;
  /** C1 S-805: Git 패널 열림(G 키가 켜고 끈다) */
  gitOpen: boolean;
  openGit: () => void;
  closeGit: () => void;
  /** slots.length = 처음 슬롯 수(0 이면 6). at = 열린 자리(화면 좌표, 없으면 아래 가운데), world = Spawn 덩어리 왼쪽 위(월드 좌표) */
  composer: { open: boolean; slots: unknown[]; at?: { x: number; y: number }; world?: { x: number; y: number } };
  openComposer: (n?: number, where?: { at?: { x: number; y: number }; world?: { x: number; y: number } }) => void; // B9 칩·B8 링이 부른다
  closeComposer: () => void;
  outputViewer: { open: boolean; nodeId: string | null; wsId?: string }; // wsId 가 없으면 보고 있는 워크스페이스
  /** D1 S-1225: 연결 모드(카드의 Connect 가 켜고 Done·Esc·탭 전환·카드 삭제가 끈다) */
  connect: { wsId: string; cardId: string } | null;
  /** D1 S-1230: Mission Map·Memory·Loops 는 한 번에 하나만, Usage popover 는 따로 */
  mission: { open: boolean };
  memory: { open: boolean };
  loops: { open: boolean };
  usage: { open: boolean; view: "usage" | "tokens" | "accounts"; agent?: string };
  openMission: () => void; toggleMission: () => void; closeMission: () => void;
  openMemory: () => void; toggleMemory: () => void; closeMemory: () => void;
  openLoops: () => void; toggleLoops: () => void; closeLoops: () => void;
  openUsage: (view?: "usage" | "tokens" | "accounts", agent?: string) => void; toggleUsage: () => void; closeUsage: () => void;
  /** 5묶음 E1 S-1800: 열린 스튜디오(하나만). 저장 안 한 편집 확인·repo 확인은 studio/useStudio 의 requestOpenStudio·requestCloseStudio 가 먼저 한다 */
  studio: { open: StudioId | null; arg?: string };
  openStudio: (id: StudioId, arg?: string) => void;
  closeStudio: () => void;
  openSettings: (pane?: string) => void; // S-383 열기 함수
  closeSettings: () => void;
}
type Panel = "mission" | "memory" | "loops";
const PANELS: Panel[] = ["mission", "memory", "loops"];
/** S-1230: 패널 셋은 하나만 열린다 */
const only = (p: Panel | null) => Object.fromEntries(PANELS.map((k) => [k, { open: k === p }]));
export const useUi = create<UiStore>((set, get) => ({
  settings: { open: false, pane: "account" },
  presetsOpen: false,
  gitOpen: false,
  openGit: () => set({ gitOpen: true }),
  closeGit: () => set({ gitOpen: false }),
  connect: null,
  mission: { open: false },
  memory: { open: false },
  loops: { open: false },
  usage: { open: false, view: "usage" },
  openMission: () => set(only("mission")), toggleMission: () => set(only(get().mission.open ? null : "mission")), closeMission: () => set({ mission: { open: false } }),
  openMemory: () => set(only("memory")), toggleMemory: () => set(only(get().memory.open ? null : "memory")), closeMemory: () => set({ memory: { open: false } }),
  openLoops: () => set(only("loops")), toggleLoops: () => set(only(get().loops.open ? null : "loops")), closeLoops: () => set({ loops: { open: false } }),
  openUsage: (view = "usage", agent) => set({ usage: { open: true, view, ...(agent ? { agent } : {}) } }),
  toggleUsage: () => set((s) => ({ usage: { ...s.usage, open: !s.usage.open } })),
  closeUsage: () => set((s) => ({ usage: { ...s.usage, open: false } })),
  studio: { open: null },
  openStudio: (id, arg) => set({ studio: arg === undefined ? { open: id } : { open: id, arg } }),
  closeStudio: () => set({ studio: { open: null } }),
  composer: { open: false, slots: [] },
  outputViewer: { open: false, nodeId: null },
  openComposer: (n = 6, where) => set({ composer: { open: true, slots: Array(n).fill(null), ...where } }),
  closeComposer: () => set({ composer: { open: false, slots: [] } }),
  openSettings: (pane) => set((s) => ({ settings: { open: true, pane: pane ?? s.settings.pane } })),
  closeSettings: () => set((s) => ({ settings: { ...s.settings, open: false } })),
}));
export const openSettings = (pane?: string) => useUi.getState().openSettings(pane);
