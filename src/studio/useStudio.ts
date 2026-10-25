// 5묶음 E1 S-1800·S-1803·S-1810: 스튜디오 열기·닫기 요청(등록·repo 확인 + 저장 안 한 편집 확인).
// Tools·레일·칩·키·명령이 모두 이 함수로 연다. 화면 상태 자체는 useUi.studio.
import { LATER_TEXT } from "../commandbar/answers";
import { mk, useThread } from "../commandbar/thread";
import { t } from "../i18n";
import { setStudioRoot } from "../lib/ipc";
import { useShell } from "../shell/useShell";
import { useUi } from "../ui/useUi";
import { getStudio, type StudioId } from "./registry";
import { confirmUnsaved } from "./unsaved";

export const NEED_REPO = "Open a repo first.";

/** null = 열렸다, 문자열 = 열지 못한 이유(명령 답으로 쓴다) */
export async function requestOpenStudio(id: StudioId, arg?: string): Promise<string | null> {
  if (!getStudio(id)) return t(LATER_TEXT);
  if (id !== "skills" && !useShell.getState().activeRepo) return NEED_REPO; // Skills 는 repo 없이도(Personal 만)
  if (useUi.getState().studio.open && !(await confirmUnsaved())) return "Cancelled.";
  setStudioRoot(useShell.getState().activeRepo ?? "");
  useUi.getState().openStudio(id, arg);
  return null;
}

/** true = 닫혔다(또는 원래 닫혀 있음), false = 취소·저장 실패 */
export async function requestCloseStudio(): Promise<boolean> {
  if (!useUi.getState().studio.open) return true;
  if (!(await confirmUnsaved())) return false;
  useUi.getState().closeStudio();
  return true;
}

/** 이 스튜디오가 등록돼 있는가(Tools·레일·칩이 그릴지 정한다) */
export const hasStudio = (id: StudioId): boolean => !!getStudio(id);

/** 틀 머리줄 제목: "Code — <repo 이름>" (Skills 는 repo 이름 없이 "Skills"). 스튜디오 Component 가 StudioFrame 에 넘긴다 */
export function studioTitle(base: string): string {
  const repo = useShell.getState().activeRepo;
  return base === "Skills" || !repo ? t(base) : `${t(base)} — ${repo.split(/[\\/]/).filter(Boolean).pop() ?? repo}`;
}
/** 틀의 × / Esc 가 부르는 닫기(저장 안 한 편집 확인 포함) */
export const closeStudioRequest = (): void => void requestCloseStudio();

/** 키(S·D)가 연다: 못 열면 이유를 명령 스레드에 남긴다("That isn't available in this version yet." 등) */
export async function openStudioByKey(id: StudioId): Promise<void> {
  const why = await requestOpenStudio(id);
  const repo = useShell.getState().activeRepo;
  if (why && why !== "Cancelled." && repo) useThread.getState().add(repo, mk("bot", why));
}
