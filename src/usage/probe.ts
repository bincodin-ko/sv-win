// D10 S-1517~S-1520: 사용량 확인 흐름(숨은 세션으로 CLI 의 사용량 명령 화면을 읽는다)
import { invoke } from "@tauri-apps/api/core";
import { runHidden, type Settled } from "../hidden/probe";
import { realClock, type Clock } from "../hidden/screen";
import { isTauri } from "../lib/ipc";
import { parseUsage, type Parsed } from "./parse";

export type UsageState = "ok" | "blocked" | "failed";
export interface UsageResult { at: number; agent: string; parsed: Parsed | null; raw: string; state: UsageState; blockedScreen?: string }
export const USAGE_AGENTS = ["claude", "codex", "gemini", "kimi", "amp", "copilot", "opencode"]; // Grok 은 안 됨
export const BG_MAX_AGE = 180_000; // 보드가 열릴 때: 3분
export const OPEN_MAX_AGE = 30_000; // popover 를 열 때: 30초
export const CHECK_TIMEOUT = 60_000; // S-1519 추측
/** 세션을 열어 차례로 입력하는 명령 */
export const SESSION_CMDS: Record<string, string[]> = {
  claude: ["/usage"], codex: ["/status", "/usage"], gemini: ["/stats"], kimi: ["/usage"], copilot: ["/usage"],
};
/** 세션 없이 인자로 실행하는 CLI (S-1517 추측) */
export const EXEC_ARGS: Record<string, string[]> = { amp: ["usage"], opencode: ["stats"] };

const PRE_QUIET = 2500; // 첫 화면이 가라앉은 뒤(신뢰 질문 수락 포함)에야 입력한다
const CMD_QUIET = 3000; // 명령 출력이 멎은 뒤 화면을 읽는다

export function isStale(at: number | undefined, now: number, maxAgeMs: number): boolean {
  return at === undefined || now - at > maxAgeMs;
}
export interface CheckOpts {
  manual: boolean;
  env?: [string, string][];
  dir?: string;
  clock?: Clock;
  /** 가짜 모드 기록용 이름(기본 agent) */
  tag?: string;
}

/** 앱 소유의 빈 폴더 %APPDATA%/com.symvibe.win/UsageProbe (S-1517) */
export const usageProbeDir = (): Promise<string> =>
  isTauri() ? invoke<string>("usage_probe_dir") : Promise.resolve("C:\\fake\\UsageProbe");

type FakeUsage = { screens: Record<string, string>; blocked: string[]; fail: string[]; calls: string[] };
const fakeUsage = () => (typeof window === "undefined" ? undefined : (window as unknown as { __fakeUsage?: FakeUsage }).__fakeUsage);

export async function checkUsage(agent: string, o: CheckOpts): Promise<UsageResult> {
  const clock = o.clock ?? realClock;
  const done = (state: UsageState, raw: string, blockedScreen?: string): UsageResult => ({
    at: clock.now(), agent, state, raw, parsed: state === "ok" ? parseUsage(agent, raw) : null, ...(blockedScreen ? { blockedScreen } : {}),
  });
  const f = fakeUsage(); // 시험용(Playwright): 실제 CLI 를 띄우지 않는다
  if (f) {
    f.calls.push(`${o.tag ?? agent}:${o.manual ? "manual" : "bg"}`);
    if (f.blocked.includes(agent)) return done("blocked", "", "Do you trust the files in this folder?");
    if (f.fail.includes(agent)) return done("failed", "timeout: nothing was printed");
    return done("ok", f.screens[agent] ?? "");
  }
  try {
    const dir = o.dir ?? (await usageProbeDir());
    const exec = EXEC_ARGS[agent];
    return await runHidden(
      { agentId: agent, args: exec, cwd: dir, env: o.env, timeoutMs: CHECK_TIMEOUT, manual: o.manual, emptyFolder: true, clock },
      async (s) => {
        const blocked = (r: Settled) => (r.blocked ? done("blocked", r.screen, r.screen) : null);
        try {
          let r = await s.waitQuiet(exec ? CMD_QUIET : PRE_QUIET, CHECK_TIMEOUT);
          if (!exec)
            for (const cmd of SESSION_CMDS[agent] ?? []) {
              if (blocked(r)) break;
              r = await s.type(cmd);
              if (blocked(r)) break;
              r = await s.waitQuiet(CMD_QUIET, CHECK_TIMEOUT);
            }
          return blocked(r) ?? done("ok", await s.screenText());
        } catch (e) {
          return done("failed", await s.screenText().catch(() => String(e)));
        }
      },
    );
  } catch (e) {
    return done("failed", String((e as Error)?.message ?? e)); // 실행 파일 없음·프로필 폴더 없음 등
  }
}
