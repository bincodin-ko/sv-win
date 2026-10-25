// U4 S-2667: 에이전트 콘솔을 처음 띄운 뒤 "라이브 상태를 켤까요?" 안내. 켜기는 설정 창을 여는 데까지만(바뀌는 파일을 보이는 확인은 그 행의 몫)
import { useEffect } from "react";
import { registry } from "../board/boards";
import { useBoard, isConsole } from "../board/store";
import { t } from "../i18n";
import { showNotice } from "../lib/notice";
import { useSettings } from "../settings/useSettings";
import { openSettings } from "../ui/useUi";

export const NUDGE_GRACE_MS = 3000; // 앱을 열고 이만큼은 복원된 보드로 보고 안내하지 않는다
export type NudgeIn = { prev: number; now: number; sinceStartMs: number; liveStatus: unknown; asked: unknown };
export function shouldNudge(i: NudgeIn): boolean {
  return i.prev === 0 && i.now > 0 && i.sinceStartMs > NUDGE_GRACE_MS && i.liveStatus !== true && !i.asked;
}

const agentConsoles = (): number =>
  [useBoard, ...registry.values()].reduce((n, st) => n + Object.values(st.getState().nodes).filter((x) => isConsole(x) && x.agentId !== "shell").length, 0);

export default function Nudge() {
  useEffect(() => {
    const t0 = Date.now();
    let prev = agentConsoles();
    // ponytail: 0.5초 조사. 보드 저장소가 워크스페이스마다 생겨서 한 번에 구독하기 어렵다 — 느려지면 registry 변화 구독으로
    const id = setInterval(() => {
      const now = agentConsoles();
      const s = useSettings.getState().s;
      if (shouldNudge({ prev, now, sinceStartMs: Date.now() - t0, liveStatus: s.liveStatus, asked: s.liveStatusAsked })) {
        const done = () => useSettings.getState().patch({ liveStatusAsked: true });
        showNotice(t("Turn on live status?"), 15000, [
          { label: t("Turn on"), run: () => { done(); openSettings("agents"); } },
          { label: t("Not now"), run: done },
        ]);
      }
      prev = now;
    }, 500);
    return () => clearInterval(id);
  }, []);
  return null;
}
