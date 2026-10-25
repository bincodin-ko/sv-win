// E6 S-1977·S-1982~1986·S-1994: 컴포넌트 밖 실행 상태. repo 경로마다 따로 — 스튜디오를 닫아도, 다른 워크스페이스로 가도 실행은 계속된다.
// 앱을 끄면 사라진다(저장 안 함: S-1209 숨은 세션 정리).
import { create } from "zustand";
import { t, tm } from "../../i18n";
import { docDelete, docGet, docList, docPut, type DocMeta } from "../../lib/ipc";
import { effortLimitMs, studioRun, type Effort, type StudioPhase, type StudioResult, type StudioRunOpts } from "../run";
import { buildPrompt } from "./prompts";
import { agentName, freeTitle, repoName, versionTitle } from "./titles";

export interface DocRun { docId: string; ask?: string; agentId: string; effort: Effort; startedAt: number; phase: StudioPhase; text: string }
export interface DocView { docId: string | null; ask?: string; versionId: string | null }
export interface RepoState { run: DocRun | null; notice: string | null; versions: DocMeta[]; md: Record<string, string>; view: DocView; loaded: boolean }
export const EMPTY: RepoState = { run: null, notice: null, versions: [], md: {}, view: { docId: null, versionId: null }, loaded: false };
export const NOTHING = tm("Nothing came back. Try Quick, or a narrower ask.");
export const BUSY = tm("A document is being written.");

export const useDocs = create<{ repos: Record<string, RepoState> }>(() => ({ repos: {} }));
export const repoState = (repo: string): RepoState => useDocs.getState().repos[repo] ?? EMPTY;
const patch = (repo: string, f: (s: RepoState) => Partial<RepoState>): void =>
  useDocs.setState((st) => {
    const cur = st.repos[repo] ?? EMPTY;
    return { repos: { ...st.repos, [repo]: { ...cur, ...f(cur) } } };
  });
const aborts = new Map<string, AbortController>();

/** 시험(e2e)에서만: window.__fakeStudioRun 이 있으면 진짜 CLI 대신 그것을 부른다 */
const run = (o: StudioRunOpts): Promise<StudioResult> => {
  const fake = (globalThis as { __fakeStudioRun?: (o: StudioRunOpts) => Promise<StudioResult> }).__fakeStudioRun;
  return fake ? fake(o) : studioRun(o);
};

async function ensureMd(repo: string, id: string): Promise<void> {
  if (repoState(repo).md[id] !== undefined) return;
  try {
    const md = await docGet(repo, id);
    patch(repo, (s) => ({ md: { ...s.md, [id]: md } }));
  } catch { /* 파일이 없으면 빈 화면 */ }
}
const newest = (s: RepoState, docId: string): DocMeta | undefined => s.versions.find((v) => v.docId === docId);

export async function loadVersions(repo: string): Promise<void> {
  const list = (await docList(repo).catch(() => [] as DocMeta[])).slice().sort((a, b) => b.startedAt - a.startedAt);
  patch(repo, () => ({ versions: list, loaded: true }));
}
/** S-1970·S-1976: 고르기는 선택일 뿐. 저장된 버전이 있으면 가장 새것을 연다. 자유 요청(ask)은 항상 빈 화면에서 */
export function select(repo: string, v: Pick<DocView, "docId" | "ask">): void {
  const top = v.docId && v.docId !== "ask" ? newest(repoState(repo), v.docId) : undefined;
  patch(repo, () => ({ view: { docId: v.docId, ask: v.ask, versionId: top?.id ?? null } }));
  if (top) void ensureMd(repo, top.id);
}
export async function showVersion(repo: string, id: string): Promise<void> {
  const m = repoState(repo).versions.find((x) => x.id === id);
  patch(repo, (s) => ({ view: { docId: m?.docId ?? s.view.docId, ask: s.view.ask, versionId: id } }));
  await ensureMd(repo, id);
}

export async function startRun(repo: string, req: { docId: string; ask?: string; agentId: string; effort: Effort }): Promise<boolean> {
  if (repoState(repo).run) return false; // S-1977: repo 마다 한 번에 하나
  const startedAt = Date.now();
  const ctl = new AbortController();
  aborts.set(repo, ctl);
  patch(repo, () => ({ notice: null, run: { docId: req.docId, ask: req.ask, agentId: req.agentId, effort: req.effort, startedAt, phase: "launching", text: "" } }));
  let res: StudioResult;
  try {
    res = await run({
      agentId: req.agentId, cwd: repo, prompt: buildPrompt(req, req.effort), limitMs: effortLimitMs(req.effort), signal: ctl.signal,
      onStatus: (phase) => patch(repo, (s) => (s.run ? { run: { ...s.run, phase } } : {})),
      onText: (text) => patch(repo, (s) => (s.run ? { run: { ...s.run, text } } : {})),
    });
  } catch (e) {
    res = { error: e instanceof Error ? e.message : String(e) };
  }
  aborts.delete(repo);
  const text = "text" in res ? res.text : "";
  let notice: string | null = null;
  if (text.trim()) {
    // S-1982·S-1983·S-1986: 온 글은 버전으로 저장(끝까지 왔으면 complete, 멈췄으면 incomplete)
    const meta: DocMeta = {
      id: `d${startedAt.toString(36)}${Math.random().toString(36).slice(2, 7)}`, docId: req.docId,
      title: req.docId === "ask" ? freeTitle(text) : versionTitle(repoName(repo), req.docId),
      agent: req.agentId, effort: req.effort, startedAt, durationMs: Math.max(0, Date.now() - startedAt), status: "ok" in res ? "complete" : "incomplete",
    };
    try {
      await docPut(repo, meta, text);
      patch(repo, (s) => ({
        run: null, versions: [meta, ...s.versions], md: { ...s.md, [meta.id]: text },
        view: s.view.docId === null || s.view.docId === req.docId ? { docId: req.docId, ask: s.view.ask, versionId: meta.id } : s.view,
      }));
      return true;
    } catch (e) {
      notice = t("Could not save the document: {err}", { err: String(e) });
    }
  } else if ("timeout" in res) notice = NOTHING;
  else if ("blocked" in res) notice = t("{name} is asking a question Symvibe will not answer for you. Open a console in this repo, answer it there, and try again.", { name: agentName(req.agentId) });
  else if ("error" in res) notice = res.error;
  patch(repo, () => ({ run: null, notice }));
  return true;
}
export function stopRun(repo: string): void {
  aborts.get(repo)?.abort();
}
/** S-1990: 파일까지 영구 삭제. 보고 있던 버전이면 같은 문서의 다음 버전(없으면 빈 화면) */
export async function removeVersion(repo: string, id: string): Promise<void> {
  await docDelete(repo, id);
  const s = repoState(repo);
  const versions = s.versions.filter((v) => v.id !== id);
  const md = { ...s.md };
  delete md[id];
  const next = s.view.versionId === id ? versions.find((v) => v.docId === s.view.docId) : undefined;
  patch(repo, (c) => ({ versions, md, view: c.view.versionId === id ? { ...c.view, versionId: next?.id ?? null } : c.view }));
  if (next) void ensureMd(repo, next.id);
}
export const dismissNotice = (repo: string): void => patch(repo, () => ({ notice: null }));
