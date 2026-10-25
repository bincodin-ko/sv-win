// S-910: 캘린더 노드 종류 등록(머리줄만 끌림, 크기 조절, Insert to-do·More)
import Calendar from "../../notes/CalendarNode";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "calendar", label: tm("Calendar"), Component: Calendar,
  defaultSize: { w: 520, h: 440 }, minSize: { w: 420, h: 360 }, resizable: true, bodyDrag: false, eraserTarget: true,
  create: () => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1, events: [] }; },
  more: { label: tm("Calendar"), order: 30 }, insertTodo: { label: tm("Calendar"), order: 30 },
});
