// S-900: 체크리스트 노드 종류 등록(머리줄만 끌림, 크기 조절, Insert to-do·More)
import Checklist from "../../notes/ChecklistNode";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "checklist", label: tm("Checklist"), Component: Checklist,
  defaultSize: { w: 300, h: 260 }, minSize: { w: 220, h: 140 }, resizable: true, bodyDrag: false, eraserTarget: true,
  create: () => ({ title: "Checklist", items: [] }),
  more: { label: tm("Checklist"), order: 10 }, insertTodo: { label: tm("Checklist"), order: 10 },
});
