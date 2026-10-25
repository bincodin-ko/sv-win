// 에이전트 Rust 명령 감싸기. Tauri 밖(vite dev·Playwright·vitest)이면 고정 목록으로 대신한다.
import { invoke } from "@tauri-apps/api/core";
import { cliResumeArgs } from "../console/resume";
import { isTauri } from "../lib/ipc";
import type { CustomAgent } from "./custom";

export type ResumeKind = "own" | "latest" | "none";
export interface AgentInfo {
  id: string;
  name: string;
  command: string;
  builtin: boolean;
  yoloArgs: string[];
  yoloEnv: Record<string, string>;
  resumeKind: ResumeKind;
  installed: boolean;
  path: string | null;
  section: "detected" | "yours" | "notInstalled";
}
export interface Resume {
  kind: ResumeKind | "new"; // "new" = 새 시작에 세션 id 지정(A9, Claude --session-id)
  sessionId?: string;
}
export interface SpawnSpec {
  program: string;
  args: string[];
  env: [string, string][];
  yolo: boolean;
  notFound: boolean;
  shellFallback: boolean;
}

// 가짜: 내장 5 + Shell. claude·shell만 설치된 것으로 본다.
const a = (id: string, name: string, resumeKind: ResumeKind, installed: boolean): AgentInfo => ({
  id, name, command: id, builtin: true, yoloArgs: [], yoloEnv: {}, resumeKind, installed,
  path: installed ? `C:\fake\${id}.exe` : null, section: installed ? "detected" : "notInstalled",
});
export const FAKE_AGENTS: AgentInfo[] = [
  a("claude", "Claude", "own", true), a("shell", "Shell", "none", true),
  a("codex", "Codex", "own", false), a("gemini", "Gemini", "latest", false),
  a("grok", "Grok", "none", false), a("opencode", "OpenCode", "latest", false),
  { ...a("aider", "Aider", "none", false), builtin: false }, // 카탈로그(내장 아님) 한 개: S-378 시험용
];

// 내 에이전트(S-376). 가짜는 localStorage 에 남긴다. 카탈로그 id 는 S-378 로 더해진 것
const fakeCustoms = (): CustomAgent[] => {
  try { return JSON.parse(localStorage.getItem("symvibe.fakeCustomAgents") ?? "[]"); } catch { return []; }
};
export const customAgentsGet = (): Promise<CustomAgent[]> =>
  isTauri() ? invoke("custom_agents_get") : Promise.resolve(fakeCustoms());
export const customAgentsSet = (list: CustomAgent[]): Promise<void> => {
  if (isTauri()) return invoke("custom_agents_set", { list });
  try { localStorage.setItem("symvibe.fakeCustomAgents", JSON.stringify(list)); } catch { /* 저장소 막힘 */ }
  return Promise.resolve();
};
// 시험용(B8): localStorage "symvibe.fakeInstalled" = 설치된 것으로 볼 카탈로그 id 배열
const fakeInstalled = (): string[] => {
  try { return JSON.parse(localStorage.getItem("symvibe.fakeInstalled") ?? "[]"); } catch { return []; }
};
const SECTION_ORDER = ["detected", "yours", "notInstalled"] as const;
const fakeList = (): AgentInfo[] => {
  const cs = fakeCustoms();
  const inst = fakeInstalled();
  const base = FAKE_AGENTS.map((x) => (!x.builtin && cs.some((c) => c.id === x.id) ? { ...x, section: "yours" as const } : inst.includes(x.id) ? { ...x, installed: true, section: "detected" as const, path: `C:\fake\${x.id}.exe` } : x));
  const mine = cs.filter((c) => !FAKE_AGENTS.some((x) => x.id === c.id)).map((c): AgentInfo => ({
    id: c.id, name: c.name, command: c.command, builtin: false, yoloArgs: [], yoloEnv: {}, resumeKind: "none", installed: true, path: c.command.split(/\s+/)[0] ?? null, section: "yours",
  }));
  const ap = (fakeGet().agentPaths ?? {}) as Record<string, string>; // 실제 Rust 계약: 지정 경로(agentPaths)가 path 에 반영되고 찾은 것으로 본다
  const withPaths = base.map((x) => (ap[x.id] ? { ...x, installed: true, section: "detected" as const, path: ap[x.id] ?? null } : x));
  return [...withPaths, ...mine].sort((x, y) => SECTION_ORDER.indexOf(x.section) - SECTION_ORDER.indexOf(y.section));
};

export const agentsList = (): Promise<AgentInfo[]> =>
  isTauri() ? invoke("agents_list") : Promise.resolve(fakeList());

/** noYolo: 숨은 세션 — 설정 Yolo 가 켜져 있어도 Yolo 인자·env 를 받지 않는다(Rust agent_spawn_spec 의 no_yolo) */
export const agentSpawnSpec = (agentId: string, opts?: { resume?: Resume; noYolo?: boolean }): Promise<SpawnSpec> => {
  if (isTauri()) return invoke("agent_spawn_spec", { agentId, resume: opts?.resume ?? null, noYolo: opts?.noYolo ?? null });
  // 가짜 Yolo(S-371): 카탈로그 에이전트만. 직접 만든 것·Shell 은 없음(S-379). noYolo 면 없음(S-1978)
  const yolo = fakeGet().yolo === true && opts?.noYolo !== true && agentId !== "shell" && !!FAKE_AGENTS.find((x) => x.id === agentId);
  const args = opts?.resume ? cliResumeArgs(agentId, opts.resume.kind === "new" ? "new" : "resume", opts.resume.sessionId) : [];
  return Promise.resolve({
    program: "fake", args: yolo && agentId === "claude" ? [...args, "--dangerously-skip-permissions"] : args, env: [],
    yolo,
    notFound: agentId.startsWith("custom:") || agentId === "gh-auth-login" ? false : !(FAKE_AGENTS.find((x) => x.id === agentId)?.installed || fakeInstalled().includes(agentId)), shellFallback: false,
  });
};

export const defaultAgent = (): Promise<string> =>
  isTauri() ? invoke("default_agent") : Promise.resolve(typeof fakeGet().defaultAgent === "string" ? (fakeGet().defaultAgent as string) : "claude");
/** Default shell 칸 안내(S-373): 지금 Shell 콘솔이 쓰는 셸 경로 */
export const currentShell = (): Promise<string> => (isTauri() ? invoke("current_shell") : Promise.resolve("C:\fake\pwsh.exe"));
// 가짜 설정은 localStorage 에 남겨 새로고침(= 재시작)에도 유지된다(A7 시험)
const fakeGet = (): Record<string, unknown> => {
  try { return { yolo: false, firstRunDone: true, ...JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}") }; } catch { return { yolo: false }; }
};
export const settingsGet = (): Promise<Record<string, unknown>> =>
  isTauri() ? invoke("settings_get") : Promise.resolve(fakeGet());
export const settingsSet = (patch: Record<string, unknown>): Promise<Record<string, unknown>> => {
  if (isTauri()) return invoke("settings_set", { patch });
  const next = { ...fakeGet(), ...patch };
  try { localStorage.setItem("symvibe.fakeSettings", JSON.stringify(next)); } catch { /* 저장소 막힘 */ }
  return Promise.resolve(next);
};
