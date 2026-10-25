// S-955·S-956: 파일 카드 종류(본문 끌기, 크기 조절, 지우개 대상). 필드 path·isDir·name. 만드는 쪽은 files/DropHost
import FileCard from "../../files/FileCard";
import { baseName } from "../../files/make";
import { fsOpen, fsReveal } from "../../lib/ipc";
import { getStore } from "../boards";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "file", label: tm("File"), Component: FileCard,
  defaultSize: { w: 240, h: 120 }, minSize: { w: 160, h: 90 }, resizable: true, bodyDrag: true, eraserTarget: true,
  create: (o) => ({ ...o, name: (o?.name as string | undefined) ?? baseName(String(o?.path ?? "")) }),
  nodeMenu: (id, store) => {
    const p = store.getState().nodes[id]?.path as string | undefined;
    return p ? [{ label: tm("Open file"), run: () => void fsOpen(p) }, { label: tm("Reveal in Explorer"), run: () => void fsReveal(p) }] : [];
  },
});

// 시험 읽기 창구(Tauri 밖에서만): e2e/filedrop.spec.ts
if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
  Object.assign(window, { __fileNodes: (ws: string) => Object.values(getStore(ws).getState().nodes) });
}
