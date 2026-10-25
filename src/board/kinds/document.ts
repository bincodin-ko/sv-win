// S-1993: Document 카드 종류. 필드 title·md·agent·date·incomplete(만든 순간의 복사본)
import DocumentCard from "../../files/DocumentCard";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "document", label: tm("Document"), Component: DocumentCard,
  defaultSize: { w: 460, h: 520 }, minSize: { w: 260, h: 200 }, resizable: true, bodyDrag: false, eraserTarget: true,
  create: (o) => ({ ...o }),
});
