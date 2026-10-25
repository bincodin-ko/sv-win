// B14 라이브러리 화면의 순수 규칙 (S-645, S-646, S-653, S-641)
import { consoleCount, type PresetDef } from "./defs";
import { tp } from "../i18n";

/** "12 agents · 3 teams" (1 이면 단수) */
export const summaryOf = (agents: number, teams: number): string =>
  `${tp("{n} agent", "{n} agents", agents)} · ${tp("{n} team", "{n} teams", teams)}`;

/** 팀 = 콘솔 2개 이상인 레인(그룹이 생기는 레인, S-500) */
export const cardSummary = (d: PresetDef): string => summaryOf(consoleCount(d), d.lanes.filter((l) => l.count >= 2).length);

/** 아직 만들 수 없어 건너뛰는 타일 종류(중복 없이, S-641) */
export const skippedKinds = (d: PresetDef, known: string[]): string[] => [...new Set(d.tiles.map((t) => t.kind).filter((k) => !known.includes(k)))];

/** Fill every lane with…: 모든 레인 번호를 한 에이전트로 */
export const fillEvery = (d: PresetDef, agent: string): Record<number, string> => Object.fromEntries(d.lanes.map((_, i) => [i, agent]));

/** 레인마다 지금 보이는 에이전트: 손댄 것 > 정의의 에이전트 > 기본 */
export const laneAgents = (d: PresetDef, overrides: Record<number, string>, defaultAgent: string): string[] =>
  d.lanes.map((l, i) => overrides[i] ?? (l.agent === "default" ? defaultAgent : l.agent));
