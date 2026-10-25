// S-2901·S-2902·S-2980: planner 상태(메모리만)와 순수 선택 함수
import { create } from "zustand";
import { isTauri } from "../lib/ipc";
import { isApi, type ApiId, type CliId, type ProviderId } from "./providers";

export type PlannerState = {
  busy: { repo: string; phase: "starting" | "thinking"; since: number } | null;
  status: "none" | "ready" | "login" | "failed";
  lastFail?: string;
};
export const usePlanner = create<PlannerState>(() => ({ busy: null, status: "none" }));

const CLIS: readonly CliId[] = ["claude", "codex", "gemini", "opencode"];
const APIS: readonly ApiId[] = ["api:openai", "api:anthropic", "api:gemini", "api:compat"];

/** 설정값 -> 실제로 쓸 공급자. CLI 미설치면 다른 설치된 CLI(claude·codex·gemini·opencode 순), 없으면 off. api:*는 설치와 무관하게 그대로 */
export function plannerAgent(setting: string, installed: string[]): ProviderId | "off" {
  if (isApi(setting)) return setting;
  if (!CLIS.includes(setting as CliId)) return "off";
  return [setting as CliId, ...CLIS.filter((a) => a !== setting)].find((a) => installed.includes(a)) ?? "off";
}

/** Settings 선택지 값: 설치된 CLI + API 4개 + off */
export function plannerChoices(installed: string[]): (ProviderId | "off")[] {
  return [...CLIS.filter((a) => installed.includes(a)), ...APIS, "off"];
}

type W = { __plannerTest?: boolean; __usePlanner?: unknown };
export const plannerOn = (): boolean => isTauri() || (typeof window !== "undefined" && !!(window as unknown as W).__plannerTest);

if (typeof window !== "undefined" && !isTauri()) (window as unknown as W).__usePlanner = usePlanner; // 시험 후크
