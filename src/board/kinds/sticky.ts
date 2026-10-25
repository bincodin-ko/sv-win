// C10: sticky 노드 종류 (S-840~S-843·S-848). 놓기는 Shapes flyout 의 Sticky(shapeChoices)
import Sticky from "../../notes/StickyNote";
import { makeSticky, STICKY_SIZE } from "../../notes/sticky";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "sticky", label: tm("Sticky note"), Component: Sticky, defaultSize: STICKY_SIZE, minSize: { w: 100, h: 100 }, resizable: true, bodyDrag: true, eraserTarget: true,
  create: (o) => makeSticky(o?.text as string | undefined, o?.color as string | undefined),
});
