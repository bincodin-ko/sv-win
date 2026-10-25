// S-880~S-891: 이미지 노드 종류 + 레일 Insert image 도구 + 고리 Insert image
import { getStore } from "../boards";
import { fsOpen, fsReveal } from "../../lib/ipc";
import ImageNode from "../../images/ImageNode";
import { pickAndPlace } from "../../images/insert";
import { registerTool } from "../toolsRegistry";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "image",
  label: tm("Image"),
  Component: ImageNode,
  defaultSize: { w: 460, h: 345 },
  minSize: { w: 60, h: 45 },
  resizable: true,
  keepRatio: true, // S-890
  bodyDrag: true, // S-890: 본문 끌기
  eraserTarget: true,
  ring: { label: tm("Insert image"), order: 20 },
  place: (store, at) => void pickAndPlace(store, at), // 놓기 전에 선택창 (S-880)
  nodeMenu: (id, store) => {
    const n = store.getState().nodes[id];
    const p = (n?.shot ?? n?.path) as string | undefined;
    return p ? [{ label: tm("Open file"), run: () => void fsOpen(p) }, { label: tm("Reveal in Explorer"), run: () => void fsReveal(p) }] : [];
  },
});
registerTool({ id: "image", label: tm("Insert image"), icon: "▣", order: 80, onPlace: (store, at) => void pickAndPlace(store, at) });

// 시험 읽기 창구(Tauri 밖에서만): e2e/images.spec.ts
if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
  Object.assign(window, { __img: { nodes: (ws: string) => Object.values(getStore(ws).getState().nodes).filter((n) => n.kind === "image") } });
}
