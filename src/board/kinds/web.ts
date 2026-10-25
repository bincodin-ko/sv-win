// S-1101·S-1113: 웹 타일 종류. 레일 Web tile 도구와 고리 Insert web. makeWeb(url)은 C16·C17·C18 이 부른다.
import { getStore } from "../boards";
import { registerTool } from "../toolsRegistry";
import WebTile, { newTabId } from "../../web/WebTile";
import { placeNew, registerKind } from "./registry";
import { tm } from "../../i18n";

/** 새 웹 타일의 종류별 필드. url 이 있으면 그 주소로 연 탭 하나, 없으면 빈 시작 탭 */
export function makeWeb(url?: string): Record<string, unknown> {
  const id = newTabId();
  return { tabs: [{ id, url: url ?? "" }], active: id, zoom: 100, device: null };
}

registerKind({
  id: "web", label: tm("Web tile"), Component: WebTile,
  defaultSize: { w: 640, h: 420 }, // 추측(S-1101)
  minSize: { w: 320, h: 240 },
  resizable: true,
  bodyDrag: false, // 머리줄만 끌린다(S-1113)
  eraserTarget: true,
  // C16: auto·wireTo = 자동 미리보기(S-1140)
  create: (o) => ({ ...makeWeb(typeof o?.url === "string" ? o.url : undefined), ...(o?.auto ? { auto: true } : {}), ...(typeof o?.wireTo === "string" ? { wireTo: o.wireTo } : {}) }),
  ring: { label: tm("Insert web"), order: 40 },
});
registerTool({ id: "web", label: tm("Web tile"), icon: "◎", order: 78, onPlace: (store, at) => void placeNew(store, "web", undefined, at) });

// 시험 읽기 창구(Tauri 밖에서만): e2e/webtile.spec.ts
if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
  Object.assign(window, { __web: { node: (ws: string) => Object.values(getStore(ws).getState().nodes).find((n) => n.kind === "web") } });
}
