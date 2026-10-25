// S-1369: Memory 카드 종류. 저장 필드는 wired·lastPush 뿐(사실은 파일이 원본)
import MemoryCard from "../../memory/MemoryCard";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "memory", label: tm("Memory card"), Component: MemoryCard,
  defaultSize: { w: 300, h: 200 }, // 추측(S-1369)
  minSize: { w: 240, h: 150 },
  resizable: true,
  bodyDrag: false, // 머리줄만 끌린다
  eraserTarget: true,
  wireColor: "violet",
  create: () => ({ wired: [] }),
  more: { label: tm("Memory card"), order: 60 },
});
