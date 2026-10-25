// D3 프로필 → 자식 환경 변수 (S-1612). D8·D10·D13 이 에이전트를 띄울 때 부른다.
import { profileEnv, type ProfileAgent } from "../lib/ipc";
import { useSettings } from "../settings/useSettings";

/** settings.profileUse[agent] 가 가리키는 프로필의 환경 변수 한 쌍. 안 골랐으면 [] (기본 로그인 그대로) */
export async function profileEnvFor(agent: string): Promise<[string, string][]> {
  if (agent !== "claude" && agent !== "codex") return [];
  const use = useSettings.getState().get().profileUse as Record<string, string | null | undefined> | undefined;
  const id = use?.[agent];
  return id ? [await profileEnv(agent as ProfileAgent, id)] : [];
}

export type ConsoleProfile = { env: [string, string][]; dir?: string; missing: boolean };
/** D12 S-1626: 콘솔 노드의 profile 로 시작 환경 한 쌍과 설정 폴더. 폴더·프로필이 없으면 env 없음 + missing(호출한 쪽이 노드 필드를 지운다) */
export async function consoleProfile(agent: string, profile?: string): Promise<ConsoleProfile> {
  if (!profile || (agent !== "claude" && agent !== "codex")) return { env: [], missing: false };
  try {
    const pair = await profileEnv(agent, profile);
    return { env: [pair], dir: pair[1], missing: false };
  } catch {
    return { env: [], missing: true };
  }
}
