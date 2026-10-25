// B13 내장 preset 18개 정의 (S-640, S-641). 데이터만. 좌표·타일 크기는 추측값.
import { tm } from "../i18n";
import { CONSOLE_H, CONSOLE_W } from "../board/store";
import type { Role } from "../commandbar/roles";

/** 레인 = 같은 그룹으로 묶이는 콘솔 줄. x,y = 덩어리 왼쪽 위 기준 월드 좌표. 콘솔은 cols 칸 격자 */
export type Lane = { group: string; role: Role; count: number; agent: "default" | string; x: number; y: number; cols: number };
/** 도우미 타일: 종류 + 레인 칸 번호(gx) + 만들 때 옵션. 크기는 registry 기본 크기, 세로 위치는 plan 이 계산(S-1161). registry 에 없는 종류는 건너뛴다 (S-641) */
export type Tile = { kind: string; gx: number; opts?: Record<string, unknown> };
export type PresetDef = { id: string; name: string; lanes: Lane[]; tiles: Tile[] };

const GAP = 24;
const STEP_X = CONSOLE_W + GAP;
const STEP_Y = CONSOLE_H + GAP;
/** 레인 칸(2×2 콘솔 + 여백) */
export const BW = 2 * STEP_X + 120;
export const BH = 2 * STEP_Y + 120;

const lane = (group: string, role: Role, count: number, gx: number, gy = 0): Lane => ({ group, role, count, agent: "default", x: gx * BW, y: gy * BH, cols: Math.min(count, 2) });
const DEFAULT_OPTS: Record<string, Record<string, unknown>> = { web: { url: "http://localhost:3000" } };
/** gx 번째 칸 가운데 세로 줄에 쌓을 타일들(S-1162: 웹은 localhost:3000) */
const tiles = (gx: number, ...kinds: string[]): Tile[] => kinds.map((kind) => ({ kind, gx, ...(DEFAULT_OPTS[kind] ? { opts: DEFAULT_OPTS[kind] } : {}) }));
const preset = (name: string, lanes: Lane[], t: Tile[] = []): PresetDef => ({ id: name.toLowerCase().replace(/\s+/g, "-"), name, lanes, tiles: t });
const squads = (name: string, n: number) =>
  preset(name, Array.from({ length: n }, (_, i) => lane(`Squad ${i + 1}`, "general", 4, i % 2, Math.floor(i / 2))));

export const PRESETS: PresetDef[] = [
  preset(tm("Dev HQ"), [lane("Frontend", "frontend", 4, 0), lane("Backend", "backend", 4, 2), lane("Reviewers", "reviewers", 4, 1, 1)], tiles(1, "kanban", "web", "orchestrator")),
  preset(tm("Sprint Room"), [lane("Frontend", "frontend", 2, 0), lane("Backend", "backend", 2, 2)], tiles(1, "kanban", "orchestrator")),
  preset(tm("Web Studio"), [lane("Design", "design", 2, 0), lane("Frontend", "frontend", 3, 2)], tiles(1, "web", "orchestrator")),
  preset(tm("Ship It"), [lane("Frontend", "frontend", 2, 0), lane("Testers", "testers", 2, 1), lane("Backend", "backend", 2, 0, 1), lane("Reviewers", "reviewers", 2, 1, 1)], tiles(2, "kanban", "orchestrator")),
  preset(tm("Bug Hunt"), [lane("Testers", "testers", 3, 0), lane("Reviewers", "reviewers", 2, 1)], [{ kind: "kanban", gx: 2, opts: { title: "Triage" } }]),
  preset(tm("Pair"), [lane("Pair", "general", 2, 0)]),
  preset(tm("Trio"), [lane("Trio", "general", 3, 0)]),
  preset(tm("Squad of Four"), [lane("Squad", "general", 4, 0)]),
  squads(tm("Two Squads"), 2),
  squads(tm("Three Squads"), 3),
  squads(tm("Four Squads"), 4),
  preset(tm("Squad and Board"), [lane("Squad", "general", 4, 0)], tiles(1, "kanban")),
  preset(tm("Squad and Preview"), [lane("Squad", "general", 4, 0)], tiles(1, "web")),
  preset(tm("Briefed Squad"), [lane("Squad", "general", 4, 0)], tiles(1, "orchestrator")),
  preset(tm("Feature Squad"), [lane("Frontend", "frontend", 2, 0), lane("Backend", "backend", 2, 1)]),
  preset(tm("Review Panel"), [lane("Reviewers", "reviewers", 3, 0)]),
  preset(tm("Security Sweep"), [lane("Security", "security", 2, 0), lane("Reviewers", "reviewers", 2, 1)]),
  preset(tm("Docs Sprint"), [lane("Docs", "docs", 3, 0)]),
];

export const consoleCount = (d: PresetDef): number => d.lanes.reduce((n, l) => n + l.count, 0);
