// D13 S-1380~S-1388: Scan repo·Refresh 동작. 패널의 Scan repo 버튼과 행의 Refresh 아이콘이 부른다 (S-1361·S-1363)
// 상태는 useScan(패널을 닫아도 남음). 숨은 세션 질문·답은 ask.ts, 답 해석은 parseFacts.ts, 프롬프트는 prompts.ts
import { agentsList, defaultAgent } from "../agents/api";
import { getStore } from "../board/boards";
import { t } from "../i18n";
import type { Clock } from "../hidden/screen";
import { memorySave, type MemoryFact } from "../lib/ipc";
import { useSettings } from "../settings/useSettings";
import { useShell } from "../shell/useShell";
import { useUi } from "../ui/useUi";
import { ask, AskError, newCtl, type AskCtl } from "./ask";
import { newFact } from "./facts";
import { parseFacts, parseRefresh, type Proposal } from "./parseFacts";
import { refreshPrompt, scanPrompt, type Quality } from "./prompts";
import { saveError, useMemory } from "./useMemory";
import { useScan, SCAN_IDLE, type Row, type ScanAgent, type ScanError } from "./useScan";

export const SCAN_TIMEOUT_MS = 600_000; // S-1382
/** 숨은 세션으로 물을 수 있는 에이전트 (S-0: 5종 중 2종만) */
export const AGENTS: ScanAgent[] = [
  { id: "claude", label: "Claude Code", name: "Claude" },
  { id: "codex", label: "Codex", name: "Codex" },
];
type Opts = { clock?: Clock; timeoutMs?: number };
const set = useScan.setState;
const nameOf = (id: string) => AGENTS.find((a) => a.id === id)?.name ?? id;

/** 마지막으로 고른 것 > 기본 에이전트 > 설치된 첫 것 (S-1380) */
export function pickAgent(installed: string[], saved: unknown, def: string): string | null {
  return [saved, def].find((x): x is string => typeof x === "string" && installed.includes(x)) ?? installed[0] ?? null;
}
async function loadAgents(): Promise<{ agents: ScanAgent[]; agent: string | null }> {
  const have = new Set((await agentsList()).filter((a) => a.installed).map((a) => a.id));
  const agents = AGENTS.filter((a) => have.has(a.id));
  const def = await defaultAgent().catch(() => "");
  return { agents, agent: pickAgent(agents.map((a) => a.id), useSettings.getState().get().memoryAgent, def) };
}

function errorOf(e: unknown, agent: string, what: string): ScanError | null {
  if (e instanceof AskError) {
    if (e.reason === "cancelled") return null;
    if (e.reason === "blocked") return { kind: "blocked", agent, text: t("{name} needs an answer. Open a console of it, answer, and scan again.", { name: nameOf(agent) }) };
    if (e.reason === "timeout") return { kind: "other", text: what === "scan" ? t("The scan took too long.") : t("The check took too long.") };
  }
  return { kind: "other", text: e instanceof Error ? e.message : String(e) };
}

/** 한 번 묻고 사실 제안 목록을 돌려준다 (S-1381) */
export async function runScan(o: { repo: string; agent: string; quality: Quality; ctl?: AskCtl; onPhase?: (p: "read" | "write") => void } & Opts): Promise<Proposal[]> {
  const text = await ask({ agent: o.agent, repo: o.repo, prompt: scanPrompt(o.quality), timeoutMs: o.timeoutMs ?? SCAN_TIMEOUT_MS, ctl: o.ctl, onPhase: o.onPhase, clock: o.clock });
  return parseFacts(text);
}

/** Scan repo 를 누르면: 시작 화면을 연다. 진행·결과 화면이 있으면 그대로 둔다 (S-1380·S-1388: 동시에 하나) */
export async function scanRepo(repo: string): Promise<void> {
  const st = useScan.getState().stage;
  if (st === "running" || st === "review") return;
  const a = await loadAgents();
  set({ ...SCAN_IDLE, refresh: useScan.getState().refresh, refreshCtl: useScan.getState().refreshCtl, stage: "start", repo, ...a });
}

export async function startScan(o: Opts = {}): Promise<void> {
  const s = useScan.getState();
  if (!s.repo || !s.agent || s.stage === "running") return;
  const { repo, agent, quality } = s;
  useSettings.getState().patch({ memoryAgent: agent });
  const ctl = newCtl();
  set({ stage: "running", phase: 0, ctl, error: null, rows: [] });
  try {
    const facts = await runScan({ repo, agent, quality, ctl, ...o, onPhase: (p) => set({ phase: p === "read" ? 1 : 2 }) });
    if (ctl.cancelled) return;
    const d = useMemory.getState().data;
    const have = new Set([...(d[repo] ?? []), ...(d._all ?? [])].map((f) => `${f.kind}\n${f.title}`));
    const rows: Row[] = facts.map((f) => ({ ...f, dup: have.has(`${f.kind}\n${f.title}`), checked: !have.has(`${f.kind}\n${f.title}`) }));
    set({ stage: "review", rows, ctl: null });
  } catch (e) {
    if (ctl.cancelled) return;
    set({ stage: "error", error: errorOf(e, agent, "scan"), ctl: null });
  }
}

/** 진행 중 취소: 숨은 세션을 끄고 아무것도 저장하지 않는다 */
export function cancelScan(): void {
  useScan.getState().ctl?.cancel();
  set({ stage: "idle", ctl: null, rows: [], error: null });
}
export function discardScan(): void {
  set({ stage: "idle", rows: [], error: null });
}

/** 한 목록을 바꿔 상태와 파일에 쓴다 (useMemory 의 키 규칙: repo 경로 또는 "_all") */
async function putList(repo: string, key: string, list: MemoryFact[]): Promise<void> {
  const before = useMemory.getState().data[key];
  useMemory.setState((s) => ({ data: { ...s.data, [key]: list }, error: null }));
  try {
    await memorySave(repo, key === "_all" ? "all" : "repo", list);
  } catch (e) { // S-1353
    useMemory.setState((s) => ({ data: { ...s.data, [key]: before ?? [] }, error: saveError(e) }));
  }
}

/** Add N to memory: 체크된 것만 현재 탭 범위로 저장 (S-1384) */
export async function addSelected(): Promise<void> {
  const { repo, rows } = useScan.getState();
  const picks = rows.filter((r) => r.checked);
  if (!repo || !picks.length) return;
  const scope = useMemory.getState().tab === "repo" ? "repo" : "all";
  const key = scope === "repo" ? repo : "_all";
  if (!useMemory.getState().data[key]) await useMemory.getState().load(repo);
  const list = [...(useMemory.getState().data[key] ?? []), ...picks.map((p) => newFact({ kind: p.kind, title: p.title, body: p.body, scope }))];
  set({ stage: "idle", rows: [], error: null });
  await putList(repo, key, list);
}

/** 막힘 안내의 Open console: 그 에이전트 콘솔을 repo 보드에 놓는다 (S-1385) */
export function openAgentConsole(agent: string): void {
  const { repo } = useScan.getState();
  const ws = useShell.getState().openRepos.find((r) => r.path === repo)?.activeWs;
  if (ws) getStore(ws).getState().spawnConsole(agent);
  set({ stage: "idle", error: null });
  useUi.getState().closeMemory();
}

// ---- 사실 하나의 Refresh (S-1386) ----
/** id 로 찾은 사실 하나를 바꾸거나(fn) 지운다(null) */
async function patchFact(repo: string, id: string, fn: ((f: MemoryFact) => MemoryFact) | null): Promise<void> {
  const d = useMemory.getState().data;
  const key = [repo, "_all"].find((k) => d[k]?.some((f) => f.id === id));
  if (!key) return;
  await putList(repo, key, d[key]!.flatMap((f) => (f.id !== id ? [f] : fn ? [fn(f)] : [])));
}

export async function refreshFact(repo: string, fact: MemoryFact, o: Opts = {}): Promise<void> {
  if (useScan.getState().refresh?.status === "running") return;
  const ctl = newCtl();
  set({ refresh: { factId: fact.id, title: fact.title, status: "running" }, refreshCtl: ctl });
  const fail = (text: string) => set({ refresh: { factId: fact.id, title: fact.title, status: "error", text }, refreshCtl: null });
  try {
    const agent = (await loadAgents()).agent;
    if (!agent) return fail(t("Install Claude Code or Codex"));
    set({ refresh: { factId: fact.id, title: fact.title, status: "running", agent } });
    const text = await ask({ agent, repo, prompt: refreshPrompt(fact), timeoutMs: o.timeoutMs ?? SCAN_TIMEOUT_MS, ctl, clock: o.clock });
    if (ctl.cancelled) return;
    const a = parseRefresh(text);
    if (!a) return fail(t("The answer could not be read. Try again."));
    if (a.status === "ok") await patchFact(repo, fact.id, (f) => ({ ...f, refreshedAt: new Date().toISOString() }));
    set({ refresh: { factId: fact.id, title: fact.title, status: a.status, body: a.body, agent }, refreshCtl: null });
  } catch (e) {
    if (ctl.cancelled) return;
    fail(errorOf(e, "", "check")?.text ?? "");
  }
}
export function cancelRefresh(): void {
  useScan.getState().refreshCtl?.cancel();
  set({ refresh: null, refreshCtl: null });
}
/** changed: Update/Keep, gone: Delete/Keep */
export async function resolveRefresh(repo: string, action: "update" | "delete" | "keep"): Promise<void> {
  const r = useScan.getState().refresh;
  set({ refresh: null, refreshCtl: null });
  if (!r) return;
  if (action === "update" && r.body) await patchFact(repo, r.factId, (f) => ({ ...f, body: r.body!, refreshedAt: new Date().toISOString() }));
  else if (action === "delete") await patchFact(repo, r.factId, null);
}
