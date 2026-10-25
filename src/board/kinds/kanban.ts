// S-930: 칸반 노드 종류. Insert to-do › Board, 고리 More › Kanban board.
import { getStore } from "../boards";
import Kanban from "../../notes/kanban/KanbanBoard";
import { initialColumns } from "../../notes/kanban/kanban";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "kanban",
  label: tm("Kanban board"),
  Component: Kanban,
  defaultSize: { w: 960, h: 460 }, // 추측(S-930)
  minSize: { w: 480, h: 280 }, // 추측(S-943)
  resizable: true,
  bodyDrag: false, // 머리줄만 끌린다(S-809)
  eraserTarget: true,
  create: () => ({ title: "Board", columns: initialColumns() }),
  more: { label: tm("Kanban board"), order: 30 },
  insertTodo: { label: tm("Board"), order: 30 },
});

// 시험 읽기 창구(Tauri 밖에서만): e2e/kanban.spec.ts
if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
  const first = (ws: string) => Object.values(getStore(ws).getState().nodes).find((n) => n.kind === "kanban");
  Object.assign(window, {
    __kb: {
      node: (ws: string) => first(ws),
      cols: (ws: string) => first(ws)?.columns,
      count: (ws: string) => Object.keys(getStore(ws).getState().nodes).length,
    },
  });
}
