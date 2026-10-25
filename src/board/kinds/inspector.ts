// S-1130: 웹 인스펙터 카드. 저장 필드는 wireTo(타일)·tab(붙은 탭). 타일이 지워지면 같이 지워진다(S-812).
import InspectorCard from "../../web/InspectorCard";
import { getStore } from "../boards";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "inspector", label: tm("Web inspector"), Component: InspectorCard,
  defaultSize: { w: 300, h: 180 }, // 추측(S-1130)
  minSize: { w: 220, h: 140 },
  resizable: true,
  bodyDrag: false, // 머리줄만 끌린다
  eraserTarget: true,
  deleteWithTarget: true,
  wireColor: "cyan",
  create: (o) => ({ wireTo: o?.wireTo, tab: o?.tab }),
});

// 시험 읽기 창구(Tauri 밖에서만): e2e/webinspector.spec.ts
if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
  Object.assign(window, {
    __insp: {
      nodes: (ws: string) => Object.values(getStore(ws).getState().nodes),
      selection: (ws: string) => getStore(ws).getState().selection,
      remove: (ws: string, id: string) => getStore(ws).getState().removeNodes([id]),
    },
  });
}
