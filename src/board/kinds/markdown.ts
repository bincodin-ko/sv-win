// S-959·S-963·S-964: Markdown 카드 종류. 필드 path·name 만(글은 디스크에서 읽는다)
import MarkdownCard from "../../files/MarkdownCard";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "markdown", label: tm("Markdown"), Component: MarkdownCard,
  defaultSize: { w: 460, h: 380 }, minSize: { w: 240, h: 140 }, resizable: true, bodyDrag: false, eraserTarget: true,
  create: (o) => ({ ...o }),
});
