// D13 S-1380~S-1388: Scan·Refresh 화면 상태. 패널을 닫아도 남는다 (동작은 scan.ts)
import { create } from "zustand";
import type { AskCtl } from "./ask";
import type { Proposal } from "./parseFacts";
import type { Quality } from "./prompts";

export type ScanAgent = { id: "claude" | "codex"; label: string; name: string };
export type ScanError = { kind: "blocked" | "other"; text: string; agent?: string };
export type Row = Proposal & { dup: boolean; checked: boolean };
export type Refresh = { factId: string; title: string; status: "running" | "ok" | "changed" | "gone" | "error"; body?: string; text?: string; agent?: string };
export type ScanState = {
  stage: "idle" | "start" | "running" | "review" | "error";
  repo: string | null;
  agents: ScanAgent[];
  agent: string | null;
  quality: Quality;
  /** 0 Launch · 1 Read the repo · 2 Write facts */
  phase: 0 | 1 | 2;
  rows: Row[];
  error: ScanError | null;
  ctl: AskCtl | null;
  refresh: Refresh | null;
  refreshCtl: AskCtl | null;
};
export const SCAN_IDLE: ScanState = { stage: "idle", repo: null, agents: [], agent: null, quality: "balanced", phase: 0, rows: [], error: null, ctl: null, refresh: null, refreshCtl: null };
export const useScan = create<ScanState>(() => SCAN_IDLE);
