// S-957·S-958·S-963·S-964: 코드 카드 종류(머리줄만 끌림, 크기 조절, 지우개 대상). 필드 path·name·text·truncated. 만드는 쪽은 files/make.ts
import CodeCard from "../../files/CodeCard";
import { clipForStore } from "../../files/clip";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "code", label: tm("Code"), Component: CodeCard,
  defaultSize: { w: 480, h: 360 }, minSize: { w: 240, h: 140 }, resizable: true, bodyDrag: false, eraserTarget: true,
  create: (o) => ({ ...o, ...clipForStore(String(o?.text ?? "")) }),
});
