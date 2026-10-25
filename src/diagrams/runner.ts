import { t, tm } from "../i18n";
// E3 S-2023·S-2025·S-2028·S-2030: 만들기 실행(상태 + 순수 판정). 카드·패널이 이것을 본다
import { create } from "zustand";
import type { BoardStore } from "../board/boards";
import { diagramPut, isTauri } from "../lib/ipc";
import { effortLimitMs, studioRun, type Effort, type StudioPhase, type StudioResult, type StudioRunOpts } from "../studio/run";
import { landDiagram } from "./land";
import { parseDiagram } from "./parse";
import { buildDiagramPrompt, type DiagramStyle } from "./prompt";
import { buildSpec } from "./spec";

export const NOTHING_USABLE = tm("The agent returned nothing usable.");
export const AGENT_NAMES: Record<string, string> = { claude: "Claude Code", codex: "Codex" };
export const agentName = (id: string): string => AGENT_NAMES[id] ?? id;

export function canStart(o: { repo: string | null; running: boolean; subject: string }): boolean {
  return !!o.repo && !o.running && o.subject.trim() !== "";
}
/** 저장 이름에 쓰는 id: 영숫자·하이픈만(Rust 검증과 같다) */
export const newDiagramId = (): string => `dia-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 끝난 결과 → 카드 안내 문구. 글이 있으면 null(= 읽어 보고 착지), 안내 없이 닫으면 "" */
export function failMessage(r: StudioResult, name: string): string | null {
  if ("blocked" in r) return t("{name} is asking a question Symvibe will not answer for you. Open a console in this repo, answer it there, and try again.", { name });
  if ("error" in r) return r.error;
  if (r.text) return null;
  return "stopped" in r ? "" : t("Nothing came back. Try Quick, or a narrower ask.");
}

export interface RunReq { subject: string; agentId: string; effort: Effort; style: DiagramStyle; repo: string; wsId: string; store: BoardStore }
export interface Run extends RunReq { status: StudioPhase; startedAt: number; ac: AbortController; error?: string; hint?: boolean }
export const useRun = create<{ run: Run | null }>(() => ({ run: null }));
const set = (p: Partial<Run> | null) => useRun.setState((s) => ({ run: p === null ? null : s.run ? { ...s.run, ...p } : s.run }));

type FakeRun = (o: StudioRunOpts) => Promise<StudioResult>;

export async function startRun(req: RunReq): Promise<void> {
  const cur = useRun.getState().run;
  if (cur && !cur.error) return;
  const ac = new AbortController();
  useRun.setState({ run: { ...req, status: "launching", startedAt: Date.now(), ac } });
  const fake = isTauri() ? undefined : (window as unknown as { __fakeStudioRun?: FakeRun }).__fakeStudioRun; // e2e 가짜 실행기(Tauri 밖에서만)
  const r = await (fake ?? studioRun)({
    agentId: req.agentId, cwd: req.repo, prompt: buildDiagramPrompt(req.subject, req.effort, req.style), limitMs: effortLimitMs(req.effort),
    signal: ac.signal, onStatus: (status) => useRun.getState().run?.ac === ac && set({ status }),
  });
  if (useRun.getState().run?.ac !== ac) return; // 그 사이 닫혔다
  const msg = failMessage(r, agentName(req.agentId));
  if (msg !== null) return msg ? set({ error: msg }) : set(null);
  const d = parseDiagram("text" in r ? r.text : "");
  if (!d) return "stopped" in r ? set(null) : set({ error: NOTHING_USABLE, hint: true });
  const spec = buildSpec(d, req.style);
  const id = newDiagramId();
  await diagramPut(id, JSON.stringify(spec)).catch(() => undefined); // 저장이 안 돼도 도형은 놓는다(내보내기만 안 뜬다)
  landDiagram(req.store, spec, id);
  set(null);
}
/** × : 도는 중이면 멈추고(지금까지 온 것은 착지), 오류 카드면 그냥 닫는다 */
export function closeRun(): void {
  const r = useRun.getState().run;
  if (!r) return;
  if (r.error) set(null);
  else r.ac.abort();
}
export function retryRun(): void {
  const r = useRun.getState().run;
  if (!r?.error) return;
  const { status: _s, startedAt: _t, ac: _a, error: _e, hint: _h, ...req } = r;
  useRun.setState({ run: null });
  void startRun(req);
}
