// D7: 열려 있을 때만 Mission Map 을 그린다(열림 상태 = useUi.mission, D1)
import { getStore } from "../board/boards";
import { useUi } from "../ui/useUi";
import MissionMap from "./MissionMap";
import { recordTask } from "./tasks";

// 시험 후크(e2e/mission.spec.ts): Tauri 밖에서 주소에 ?kindsTest 가 있을 때만
if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window) && window.location.search.includes("kindsTest")) {
  Object.assign(window, { __mm: { recordTask, rename: (id: string, name: string, ws = "ws-fake") => getStore(ws).getState().updateNode(id, { name }) } });
}

export default function MissionHost() {
  return useUi((s) => s.mission.open) ? <MissionMap /> : null;
}
